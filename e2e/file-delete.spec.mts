import { expect, test } from "./fixtures.mts";
import {
	confirmPalette,
	menuItems,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	t,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	// ゴミ箱の保存先を保管庫の中にして、テストがOSのゴミ箱を使わないようにする。
	await obsidian.evaluateApp(() => {
		(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
			"trashOption",
			"local",
		);
	});
});

test(".base などノート以外のファイルも、確認してからゴミ箱へ移動できる", async ({ obsidian }) => {
	await obsidian.evaluateApp(async () => {
		await app.vault.create("Sample view.base", "views:\n  - type: table\n    name: Table\n");
	});
	const page = await openPaletteWith(obsidian, "Sample view");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Sample view");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page)
		.filter({ hasText: t("fileDelete.menu.single") })
		.click();

	const confirm = confirmPalette(page);
	await expect(confirm.locator(".prompt-input")).toHaveAttribute(
		"placeholder",
		t("fileDelete.confirm.title.single"),
	);
	await page.keyboard.press("Control+Enter");
	await expect(confirm).toBeHidden();
	await expect.poll(() => obsidian.exists("Sample view.base")).toBe(false);
});
