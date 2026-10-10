import { expect, test } from "obsidian-e2e-toolkit";
import { MODAL_INPUT, openPaletteWith, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("hotkey settings record changes, reject conflicts and restore defaults", async ({
	obsidian,
}, testInfo) => {
	await obsidian.waitReady();
	const page = obsidian.page;
	const settingsOpened = page.context().waitForEvent("page");
	await obsidian.evaluateApp(() => {
		const setting = (
			app as unknown as { setting: { open(): void; openTabById(id: string): void } }
		).setting;
		setting.open();
		setting.openTabById("my-palette");
	});
	const settingsPage = await settingsOpened;
	await expect(
		settingsPage.locator(".setting-item-name").filter({ hasText: /^Hotkeys$/ }),
	).toBeVisible({ timeout: 10_000 });
	await settingsPage
		.locator(".setting-item-name")
		.filter({ hasText: /^Hotkeys$/ })
		.click();
	const row = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("Temporarily hide palette", { exact: true }) });
	const input = row.getByRole("textbox");
	await expect(input).toHaveValue("Alt+H");
	await row.getByRole("button", { name: "Change", exact: true }).click();
	await settingsPage.keyboard.press("Escape");
	await expect(input).toHaveValue("Alt+H");
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "Change", exact: true }).click();
	await settingsPage.keyboard.press("Control+r");
	await expect(row).toContainText("Already assigned to Search history");
	await settingsPage.keyboard.press("Alt+n");
	await expect(input).toHaveValue("Alt+N");
	await row.getByRole("button", { name: "Disable", exact: true }).click();
	await expect(input).toHaveValue("Disabled");
	await row.getByRole("button", { name: "Reset", exact: true }).click();
	await expect(input).toHaveValue("Alt+H");
	await row.getByRole("button", { name: "Change", exact: true }).click();
	await settingsPage.keyboard.press("Alt+n");
	await expect(input).toHaveValue("Alt+N");
	await settingsPage.screenshot({ path: testInfo.outputPath("hotkeys.png") });
	await settingsPage.close();
	await page.bringToFront();
	await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
	await obsidian.reloadPlugin("my-palette");
	await openPaletteWith(obsidian, "query");
	const container = page.locator(".my-palette-modal-container");
	await page.keyboard.down("Alt");
	await page.keyboard.down("n");
	await expect(container).toBeHidden();
	await page.keyboard.up("Alt");
	await page.keyboard.up("n");
	await expect(container).toBeVisible();
	await expect(page.locator(MODAL_INPUT)).toBeFocused();
});
