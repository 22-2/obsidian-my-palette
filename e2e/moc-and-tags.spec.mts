import { expect, test } from "./fixtures.mts";
import type { Page } from "@playwright/test";
import {
	IGNORED_OPTION,
	flipOption,
	optionMenuTitles,
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
	setIgnoreFilters,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

async function inspectPreviewThroughModal(page: Page): Promise<void> {
	const container = page.locator(".my-palette-modal-container");
	await page.keyboard.down("Alt");
	await page.keyboard.down("h");
	await expect(container).toBeHidden();
	await page.keyboard.up("h");
	await expect(container).toBeVisible();
	await expect(page.locator(MODAL_INPUT)).toBeFocused();
	await page.keyboard.down("h");
	await expect(container).toBeHidden();
	await page.keyboard.up("Alt");
	await expect(container).toBeVisible();
	await page.keyboard.up("h");
}

test("a result can be inserted into the active note's MOC Relateds", async ({ obsidian }) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n## Body\ntext\n");
	await obsidian.createNote("Child note.md", "child");
	await obsidian.open("Topic MOC.md");

	const page = await openPaletteWith(obsidian, "child");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Child note");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "Insert into MOC Relateds" }).click();

	await expect
		.poll(() => obsidian.read("Topic MOC.md"))
		.toMatch(/- Relateds\n\s+- \[\[Child note\]\]/);
});

test("one note's mutual MOC insertion reports both link outcomes in one notice", async ({
	obsidian,
}) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n");
	await obsidian.createNote("Beta child.md", "## MOC\n- Relateds\n    - [[Topic MOC]]\n");
	await obsidian.open("Topic MOC.md");

	const page = await openPaletteWith(obsidian, "Beta child");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "MOC の Relateds に挿入" }).click();

	const notices = page.locator(".notice");
	await expect(notices).toHaveCount(1);
	await expect(notices.first()).toContainText("リンクを追加 1 件");
	await expect(notices.first()).toContainText("すでにあるリンク 1 件");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Beta child]]");
});

test("multiple result insertions update every note in order and report once", async ({
	obsidian,
}) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n");
	await obsidian.createNote("Alpha child.md", "## MOC\n- Relateds\n");
	await obsidian.createNote("Beta child.md", "## MOC\n- Relateds\n");
	await obsidian.open("Topic MOC.md");

	const page = await openPaletteWith(obsidian, "child");
	const rows = page.locator(MODAL_ROW);
	await expect(rows).toHaveCount(2);
	await rows.nth(0).click();
	await rows.nth(1).click({ modifiers: ["Shift"] });
	await rows.nth(1).click({ button: "right" });
	await menuItems(page).filter({ hasText: "MOC の Relateds に挿入" }).click();

	await expect(page.locator(".notice")).toHaveCount(1);
	await expect(page.locator(".notice")).toContainText("リンクを追加 4 件");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Alpha child]]");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Beta child]]");
	await expect.poll(() => obsidian.read("Alpha child.md")).toContain("[[Topic MOC]]");
	await expect.poll(() => obsidian.read("Beta child.md")).toContain("[[Topic MOC]]");
});

test("a failed reverse MOC link remains visible beside the successful forward link", async ({
	obsidian,
}) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n");
	await obsidian.createNote("Beta child.md", "## MOC\n- Relateds\n");
	await obsidian.open("Topic MOC.md");
	await obsidian.evaluateApp(() => {
		interface FilePath {
			path: string;
		}
		interface MutableVault {
			modify(file: FilePath, data: string): Promise<void>;
		}
		const vault = app.vault as unknown as MutableVault;
		const originalModify = vault.modify.bind(vault);
		vault.modify = async (file, data) => {
			if (file.path === "Beta child.md") throw new Error("forced reverse-link failure");
			await originalModify(file, data);
		};
	});

	const page = await openPaletteWith(obsidian, "Beta child");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "MOC の Relateds に挿入" }).click();

	const notice = page.locator(".notice");
	await expect(notice).toHaveCount(1);
	await expect(notice).toContainText("リンクを追加 1 件");
	await expect(notice).toContainText("失敗 1 件");
	await expect(notice).toContainText("MOC へのリンクを挿入できませんでした。");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Beta child]]");
	expect(await obsidian.read("Beta child.md")).not.toContain("[[Topic MOC]]");
});

test("a self-target insertion keeps its existing warning in one notice", async ({ obsidian }) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n");
	await obsidian.open("Topic MOC.md");

	const page = await openPaletteWith(obsidian, "Topic MOC");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "MOC の Relateds に挿入" }).click();

	await expect(page.locator(".notice")).toHaveCount(1);
	await expect(page.locator(".notice")).toContainText("自分自身に挿入することはできません");
	await expect.poll(() => obsidian.read("Topic MOC.md")).not.toContain("[[Topic MOC]]");
});

test("an excluded-note import failure is included in the insertion notice", async ({
	obsidian,
}) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n\n");
	await obsidian.createNote("Hidden child.md", "hidden");
	await setIgnoreFilters(obsidian, ["Hidden child.md"]);
	await obsidian.open("Topic MOC.md");
	const page = await openPaletteWith(obsidian, "Hidden child");
	await page.locator(".my-palette-options-button").click();
	await menuItems(page).filter({ hasText: "Obsidian の除外ファイルを表示" }).click();
	await page.keyboard.press("Escape");
	await page.locator(".menu").waitFor({ state: "detached" });
	await expect(page.locator(MODAL_ROW).first()).toContainText("Hidden child");
	await obsidian.evaluateApp(() => {
		interface MutableAdapter {
			read(path: string): Promise<string>;
		}
		const adapter = app.vault.adapter as unknown as MutableAdapter;
		const originalRead = adapter.read.bind(adapter);
		adapter.read = async (path) => {
			if (path === "Hidden child.md") throw new Error("forced excluded-note import failure");
			return originalRead(path);
		};
	});
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "MOC の Relateds に挿入" }).click();

	await expect(page.locator(".notice")).toHaveCount(1);
	await expect(page.locator(".notice")).toContainText("forced excluded-note import failure");
	await expect(page.locator(".notice")).toContainText(
		"この結果は利用できる Vault のノートではありません。",
	);
});

test("checked MOC notes stay above results from a different query", async ({ obsidian }) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n");
	await obsidian.createNote("Alpha child.md", "alpha");
	await obsidian.createNote("Beta child.md", "beta");
	await obsidian.open("Topic MOC.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-moc-insert-selector");
	// The options menu lists the selector's switches, Obsidian-excluded first as in the palette.
	expect((await optionMenuTitles(page)).slice(0, 3)).toEqual([
		"Include Obsidian-excluded files",
		"Mutual",
		"Highlight search matches",
	]);
	await page.locator(MODAL_INPUT).fill("alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha child");
	await page.locator(`${MODAL_ROW} [data-row-toggle]`).first().click();
	await page.keyboard.press("f");
	await page.locator(MODAL_INPUT).fill("beta");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha child");
	await expect(page.locator(MODAL_ROW).nth(1)).toContainText("Beta child");
	await expect(page.locator(`${MODAL_ROW}.is-checked`)).toHaveCount(1);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowRight");
	await expect.poll(() => obsidian.filePath()).toBe("Beta child.md");
	await expect(page.locator(MODAL_INPUT)).toBeFocused();
	await expect(page.locator(MODAL_INPUT)).toHaveAttribute("readonly", "");
	await inspectPreviewThroughModal(page);
	await page.keyboard.press("Control+Enter");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Alpha child]]");
	expect(await obsidian.read("Topic MOC.md")).not.toContain("[[Beta child]]");
	expect(await obsidian.read("Beta child.md")).not.toContain("[[Alpha child]]");
});

test("MOC insertion hides excluded notes unless the Obsidian-excluded switch is on", async ({
	obsidian,
}) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n");
	await obsidian.createNote("Visible child.md", "visible");
	await obsidian.createNote("Hidden child.md", "hidden");
	await setIgnoreFilters(obsidian, ["Hidden child.md"]);
	await obsidian.open("Topic MOC.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-moc-insert-selector");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1);
	await expect(page.locator(MODAL_ROW).first()).toContainText("Visible child");
	await page.locator(MODAL_INPUT).fill("hidden");
	await expect(page.locator(MODAL_ROW)).toHaveCount(0);
	await flipOption(page, IGNORED_OPTION);
	await expect(page.locator(MODAL_ROW).first()).toContainText("Hidden child", {
		timeout: 15_000,
	});
	await page.keyboard.press("Escape");
	expect(await obsidian.read("Topic MOC.md")).not.toContain("[[Hidden child]]");
});

test.describe("MOC insertion with plugin exclusions", () => {
	test.use({
		vaultOptions: pluginVaultOptions({ file: { excludedFolders: ["Hidden child.md"] } }),
	});

	test("includes plugin-excluded notes only with the Obsidian-excluded switch", async ({
		obsidian,
	}) => {
		await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n");
		await obsidian.createNote("Visible child.md", "visible");
		await obsidian.createNote("Hidden child.md", "hidden");
		await obsidian.open("Topic MOC.md");
		const page = obsidian.page;
		await runPaletteCommand(obsidian, "open-moc-insert-selector");
		await expect(page.locator(MODAL_ROW)).toHaveCount(1);
		await expect(page.locator(MODAL_ROW).first()).toContainText("Visible child");
		await page.locator(MODAL_INPUT).fill("hidden");
		await expect(page.locator(MODAL_ROW)).toHaveCount(0);
		await flipOption(page, IGNORED_OPTION);
		await expect(page.locator(MODAL_ROW).first()).toContainText("Hidden child");
		await page.keyboard.press("Escape");
	});
});

test("MOC insertion warns on Enter with several selected notes and accepts Ctrl+Enter", async ({
	obsidian,
}) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n");
	await obsidian.createNote("Alpha child.md", "alpha");
	await obsidian.createNote("Beta child.md", "beta");
	await obsidian.open("Topic MOC.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-moc-insert-selector");
	await expect(page.locator(MODAL_ROW)).toHaveCount(2);
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Shift+ArrowDown");
	await expect(page.locator(`${MODAL_ROW}.is-selected`)).toHaveCount(2);
	await page.keyboard.press("Enter");
	await expect(page.locator(".notice")).toContainText("Enter will only insert");
	await expect(page.locator(".notice")).toContainText("Ctrl+Enter");
	await expect(page.locator(MODAL_INPUT)).toBeVisible();
	expect(await obsidian.read("Topic MOC.md")).not.toContain("[[Alpha child]]");
	expect(await obsidian.read("Topic MOC.md")).not.toContain("[[Beta child]]");
	await page.keyboard.press("Control+Enter");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Alpha child]]");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Beta child]]");
});

test("tag preview reveals core search while the insertion modal retains focus", async ({
	obsidian,
}) => {
	await obsidian.createNote("Target.md", "target");
	await obsidian.createNote("Tagged.md", "#alpha\n");
	await obsidian.open("Target.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "open-tag-insert-selector");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-status-bar")).toBeHidden();
	await page.locator(MODAL_INPUT).fill("alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#alpha");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("ArrowRight");
	await expect
		.poll(() =>
			obsidian.evaluateApp(() =>
				app.workspace
					.getLeavesOfType("search")
					.map((leaf) => leaf.getViewState().state?.query),
			),
		)
		.toContain("tag:#alpha");
	await expect(page.locator(MODAL_INPUT)).toBeFocused();
	await expect(page.locator(MODAL_INPUT)).toHaveAttribute("readonly", "");
	await expect.poll(() => obsidian.filePath()).toBe("Target.md");
	await inspectPreviewThroughModal(page);
	await page.keyboard.press("Space");
	await expect(page.locator(`${MODAL_ROW}.is-checked`)).toHaveCount(1);
	await page.keyboard.press("Control+Enter");
	await expect.poll(() => obsidian.read("Target.md")).toContain("alpha");
});

test("several tags can be checked and inserted into the note together", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "# Tagged\n");
	await obsidian.open("Tagged.md");
	const page = obsidian.page;

	await runPaletteCommand(obsidian, "open-tag-insert-selector");
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill("alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#alpha");
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("Space");
	await expect(page.locator(`${MODAL_ROW}.is-checked`)).toHaveCount(1);

	await page.keyboard.press("f");
	await page.locator(MODAL_INPUT).fill("beta");
	await expect(page.locator(MODAL_ROW).first()).toContainText("#alpha");
	await expect(page.locator(MODAL_ROW).nth(1)).toContainText("#beta");
	await page.keyboard.press("ArrowUp");
	await page.keyboard.press("ArrowDown");
	await page.keyboard.press("Space");
	await page.keyboard.press("Control+Enter");

	await expect
		.poll(async () => {
			const content = await obsidian.read("Tagged.md");
			return ["alpha", "beta"].every((tag) => content.includes(tag));
		})
		.toBe(true);
});
