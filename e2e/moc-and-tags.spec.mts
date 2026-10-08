import { expect, test } from "obsidian-e2e-toolkit";
import {
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
});

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

test("checked MOC notes stay above results from a different query", async ({ obsidian }) => {
	await obsidian.createNote("Topic MOC.md", "## MOC\n- Relateds\n");
	await obsidian.createNote("Alpha child.md", "alpha");
	await obsidian.createNote("Beta child.md", "beta");
	await obsidian.open("Topic MOC.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "insert-link-to-moc-relateds");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-status-bar")).toBeHidden();
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
	await page.keyboard.press("Control+Enter");
	await expect.poll(() => obsidian.read("Topic MOC.md")).toContain("[[Alpha child]]");
	expect(await obsidian.read("Topic MOC.md")).not.toContain("[[Beta child]]");
	expect(await obsidian.read("Beta child.md")).not.toContain("[[Alpha child]]");
});

test("tag preview reveals core search while the insertion modal retains focus", async ({
	obsidian,
}) => {
	await obsidian.createNote("Target.md", "target");
	await obsidian.createNote("Tagged.md", "#alpha\n");
	await obsidian.open("Target.md");
	const page = obsidian.page;
	await runPaletteCommand(obsidian, "insert-tags");
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
	await page.keyboard.press("Space");
	await expect(page.locator(`${MODAL_ROW}.is-checked`)).toHaveCount(1);
	await page.keyboard.press("Control+Enter");
	await expect.poll(() => obsidian.read("Target.md")).toContain("alpha");
});

test("several tags can be checked and inserted into the note together", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "# Tagged\n");
	await obsidian.open("Tagged.md");
	const page = obsidian.page;

	await runPaletteCommand(obsidian, "insert-tags");
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
