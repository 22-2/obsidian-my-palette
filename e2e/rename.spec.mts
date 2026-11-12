import { expect, test } from "./fixtures.mts";
import {
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
	t,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("1つのファイルは、入力欄に新しい名前を直接打って Enter で変える", async ({ obsidian }) => {
	await obsidian.createNote("Old name.md", "本文");
	const page = await openPaletteWith(obsidian, "Old name");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Old name");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page)
		.filter({ hasText: t("menu.rename") })
		.click();

	// 名前の変更の入力欄は、今の名前(拡張子なし)が全選択で入っている。
	const input = page.getByPlaceholder(t("rename.single.placeholder"));
	await expect(input).toHaveValue("Old name");
	// 全選択は、開いた直後の次の処理で入る。それを待ってから打つ。
	await expect
		.poll(() => input.evaluate((el: HTMLInputElement) => el.selectionEnd! - el.selectionStart!))
		.toBe("Old name".length);
	await page.keyboard.type("New name");
	await expect(
		page
			.locator(".my-palette-suggest-modal")
			.filter({ has: input })
			.locator(".suggestion-item")
			.first(),
	).toContainText("Old name.md → New name.md");
	await page.keyboard.press("Enter");

	await expect.poll(() => obsidian.exists("New name.md")).toBe(true);
	expect(await obsidian.exists("Old name.md")).toBe(false);
	await expect(input).toBeHidden();
});

test("現在のノートの名前変更コマンドも、直接打つ入力欄を開く", async ({ obsidian }) => {
	await obsidian.createNote("Active.md", "本文");
	await obsidian.open("Active.md");
	await runPaletteCommand(obsidian, "open-rename-selector");
	const page = obsidian.page;
	await expect(page.getByPlaceholder(t("rename.single.placeholder"))).toHaveValue("Active");
	await page.locator(MODAL_INPUT).fill("Renamed");
	await page.keyboard.press("Enter");
	await expect.poll(() => obsidian.exists("Renamed.md")).toBe(true);
});
