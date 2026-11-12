import type { Page } from "@playwright/test";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import { expect, test } from "./fixtures.mts";
import {
	confirmPalette,
	MODAL_INPUT,
	MODAL_ROW,
	menuItems,
	pluginVaultOptions,
	runPaletteCommand,
	t,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

/** タグモードを開き、タグ名をキー入力で絞り込む。文字列を一度に入れると、モードの入力と合わない。 */
async function openTagList(obsidian: ObsidianAPI, tagName: string): Promise<Page> {
	// Why: メタデータのキャッシュがタグを索引するまで待つ。前に開くと、一覧が空のまま固まる。
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				(tag) => Object.keys(app.metadataCache.getTags()).includes(tag),
				`#${tagName}`,
			),
		)
		.toBe(true);
	await runPaletteCommand(obsidian, "open-tag-list");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill("");
	await page.keyboard.type(tagName, { delay: 50 });
	await expect(page.locator(MODAL_ROW).first()).toContainText(`#${tagName}`);
	return page;
}

/** タグの一括変更は「旧タグ 新タグ」を入力するパレット。入力欄の案内の文言で選ぶ。 */
function renameInput(page: Page) {
	return page.getByPlaceholder(t("tagRename.placeholder"));
}

/** 一括変更のパレットの行。背後のタグの一覧の行と区別する。 */
function renameRows(page: Page) {
	return page
		.locator(".my-palette-suggest-modal")
		.filter({ has: renameInput(page) })
		.locator(".suggestion-item");
}

test("Enter on a tag opens the global search for it", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().dblclick();
	await expect(
		obsidian.page.locator(".workspace-leaf.mod-active .search-input-container input"),
	).toHaveValue("tag:#project");
});

test("the tag context menu offers tag operations and no file operations", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	const titles = await menuItems(page).allTextContents();
	expect(titles).toEqual(
		expect.arrayContaining([
			"タグを検索 (S)",
			"現在のノートに挿入 (I)",
			"タグ名を変更 (R)",
			"タグを全削除",
		]),
	);
	expect(titles.join("\n")).not.toContain("パスをコピー");
});

test("the context menu inserts the tag into the active note's frontmatter", async ({
	obsidian,
}) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	await obsidian.createNote("Target.md", "Target body\n");
	await obsidian.open("Target.md");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "現在のノートに挿入" }).click();
	await expect.poll(() => obsidian.read("Target.md")).toMatch(/tags:\s*\n\s*-\s*project/);
});

test("the context menu renames the tag everywhere with Ctrl+Enter", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project and #project/child\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグ名を変更" }).click();

	// 変更するタグが入力済みで、続けて新しいタグを打てる。
	const input = renameInput(page);
	await expect(input).toHaveValue("#project ");
	await input.fill("#project work");
	await expect(renameRows(page).first()).toContainText("#project → #work");
	await input.press("Control+Enter");

	await expect(input).toBeHidden();
	await expect.poll(() => obsidian.read("Tagged.md")).toBe("Body #work and #work/child\n");
});

test("the context menu deletes the tag from every note after confirmation", async ({
	obsidian,
}) => {
	await obsidian.createNote("Tagged.md", "Body #project and #keep\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグを全削除" }).click();

	await expect(confirmPalette(page)).toBeVisible();
	await page.keyboard.press("Control+Enter");
	await expect.poll(() => obsidian.read("Tagged.md")).toBe("Body and #keep\n");
});

test("cancelling the delete confirmation leaves the note unchanged", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグを全削除" }).click();

	await expect(confirmPalette(page)).toBeVisible();
	await page.keyboard.press("Escape");
	await expect(confirmPalette(page)).toBeHidden();
	expect(await obsidian.read("Tagged.md")).toBe("Body #project\n");
});

test("Enter alone does not rename the tag", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグ名を変更" }).click();

	const input = renameInput(page);
	await input.fill("#project work");
	await input.press("Enter");

	await expect(input).toBeVisible();
	expect(await obsidian.read("Tagged.md")).toBe("Body #project\n");
});
