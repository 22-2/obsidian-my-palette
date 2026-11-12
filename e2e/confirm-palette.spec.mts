import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import {
	confirmPalette,
	menuItems,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	t,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

const NOTE = "Trash me.md";

test.beforeEach(async ({ obsidian }) => {
	await obsidian.createNote(NOTE, "本文");
	// ゴミ箱の保存先を保管庫の中にして、テストがOSのゴミ箱を使わないようにする。
	await obsidian.evaluateApp(() => {
		(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
			"trashOption",
			"local",
		);
	});
});

/** ノートモードで対象のノートを右クリックし、削除から確認パレットを開く。 */
async function openDeleteConfirm(obsidian: ObsidianAPI): Promise<Page> {
	const page = await openPaletteWith(obsidian, "Trash me");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Trash me");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page)
		.filter({ hasText: t("noteDelete.menu.single") })
		.click();
	await expect(confirmPalette(page)).toBeVisible();
	return page;
}

test("ノートの削除は確認パレットで Ctrl+Enter を押したときだけ実行する", async ({ obsidian }) => {
	const page = await openDeleteConfirm(obsidian);
	const confirm = confirmPalette(page);
	await expect(confirm.locator(".prompt-input")).toHaveAttribute(
		"placeholder",
		t("noteDelete.confirm.title.single"),
	);

	// Enter だけでは何も変わらず、確認パレットも開いたまま。
	await page.keyboard.press("Enter");
	await expect(confirm).toBeVisible();
	expect(await obsidian.exists(NOTE)).toBe(true);

	await page.keyboard.press("Control+Enter");
	await expect(confirm).toBeHidden();
	await expect.poll(() => obsidian.exists(NOTE)).toBe(false);
});

test("確認パレットを Esc で閉じても、ノートも元のパレットも残る", async ({ obsidian }) => {
	const page = await openDeleteConfirm(obsidian);
	await page.keyboard.press("Escape");
	await expect(confirmPalette(page)).toBeHidden();
	await expect(page.locator(MODAL_ROW).first()).toContainText("Trash me");
	expect(await obsidian.exists(NOTE)).toBe(true);
});

test("キャンセルの行を選ぶと、何も変えずに閉じる", async ({ obsidian }) => {
	const page = await openDeleteConfirm(obsidian);
	await confirmPalette(page).locator(".suggestion-item").last().click();
	await expect(confirmPalette(page)).toBeHidden();
	expect(await obsidian.exists(NOTE)).toBe(true);
});

test("行をクリックしたあとも、上下キーで行を移動できる", async ({ obsidian }) => {
	const page = await openDeleteConfirm(obsidian);
	const rows = confirmPalette(page).locator(".suggestion-item");
	const activeIndex = () =>
		rows.evaluateAll((elements) =>
			elements.findIndex((el) => el.classList.contains("is-active")),
		);

	// 押しても閉じない行を押すと、フォーカスが入力欄から body へ移り、矢印キーが一覧のスクロールになっていた。
	await rows.first().click();
	await expect(confirmPalette(page).locator(".prompt-input")).toBeFocused();
	await page.keyboard.press("ArrowDown");
	await expect.poll(activeIndex).toBe(1);
});
