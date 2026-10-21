import type { Page } from "@playwright/test";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import { expect, test } from "./fixtures.mts";
import {
	MODAL_INPUT,
	MODAL_ROW,
	menuItems,
	pluginVaultOptions,
	runPaletteCommand,
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

/** 一括変更と削除の確認ダイアログは、タイトルの文言で選ぶ。パレットと区別するため。 */
function dialogTitled(page: Page, title: string) {
	return page.locator(".modal").filter({ hasText: title });
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
			"タグを検索",
			"現在のノートに挿入",
			"タグ名を変更",
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

test("the context menu renames the tag everywhere after confirmation", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project and #project/child\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグ名を変更" }).click();

	const rename = dialogTitled(page, "タグを一括で変更");
	await rename.locator("input").nth(1).fill("work");
	await rename.getByRole("button", { name: "タグを変更" }).click();

	await dialogTitled(page, "変更しますか").getByRole("button", { name: "変更する" }).click();
	await expect.poll(() => obsidian.read("Tagged.md")).toBe("Body #work and #work/child\n");
});

test("the context menu deletes the tag from every note after confirmation", async ({
	obsidian,
}) => {
	await obsidian.createNote("Tagged.md", "Body #project and #keep\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグを全削除" }).click();

	await dialogTitled(page, "全削除しますか").getByRole("button", { name: "全削除する" }).click();
	await expect.poll(() => obsidian.read("Tagged.md")).toBe("Body and #keep\n");
});

test("cancelling the delete confirmation leaves the note unchanged", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグを全削除" }).click();

	await dialogTitled(page, "全削除しますか").getByRole("button", { name: "キャンセル" }).click();
	await expect(dialogTitled(page, "全削除しますか")).toBeHidden();
	expect(await obsidian.read("Tagged.md")).toBe("Body #project\n");
});

test("Enter in the new name field also asks for confirmation", async ({ obsidian }) => {
	await obsidian.createNote("Tagged.md", "Body #project\n");
	const page = await openTagList(obsidian, "project");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "タグ名を変更" }).click();

	const rename = dialogTitled(page, "タグを一括で変更");
	await rename.locator("input").nth(1).fill("work");
	await rename.locator("input").nth(1).press("Enter");

	await expect(dialogTitled(page, "変更しますか")).toBeVisible();
	expect(await obsidian.read("Tagged.md")).toBe("Body #project\n");
});
