import { expect, test } from "obsidian-e2e-toolkit";
import { MODAL_INPUT, openPaletteWith, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("the Shortcuts table records changes, rejects conflicts and restores defaults", async ({
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
		settingsPage.locator(".setting-item-name").filter({ hasText: /^Shortcuts$/ }),
	).toBeVisible({ timeout: 10_000 });
	await settingsPage
		.locator(".setting-item-name")
		.filter({ hasText: /^Shortcuts$/ })
		.click();

	const row = (name: string) =>
		settingsPage.locator("tr.my-palette-shortcuts__row").filter({
			has: settingsPage.getByText(name, { exact: true }),
		});
	const hidePreview = row("Temporarily hide palette");
	const key = hidePreview.locator(".my-palette-shortcuts__key");
	await expect(key).toHaveText("Alt+H");
	await expect(hidePreview.getByRole("button", { name: "Reset" })).toBeHidden();

	// Recording starts on click; Escape cancels and keeps the binding.
	await key.click();
	await expect(key).toHaveText("Press a shortcut…");
	await settingsPage.keyboard.press("Escape");
	await expect(key).toHaveText("Alt+H");

	await key.click();
	await settingsPage.keyboard.press("Control+r");
	await expect(hidePreview.locator("+ tr")).toContainText("Already assigned to Search history");
	await settingsPage.keyboard.press("Escape");
	await expect(key).toHaveText("Alt+H");

	await key.click();
	await settingsPage.keyboard.press("Alt+n");
	await expect(key).toHaveText("Alt+N");
	await expect(hidePreview.locator("+ tr")).toBeHidden();
	await settingsPage.keyboard.press("Escape");

	// Backspace turns a shortcut off, and Reset brings the default back.
	await key.click();
	await settingsPage.keyboard.press("Backspace");
	await expect(key).toHaveText("Disabled");
	await hidePreview.getByRole("button", { name: "Reset" }).click();
	await expect(key).toHaveText("Alt+H");
	await expect(hidePreview.getByRole("button", { name: "Reset" })).toBeHidden();

	// The filter narrows the table by command, keybinding or place.
	const filter = settingsPage.getByRole("searchbox", { name: "Filter shortcuts" });
	await filter.fill("mutual");
	await expect(settingsPage.locator("tr.my-palette-shortcuts__row:visible")).toHaveCount(1);
	await expect(row("Toggle Mutual")).toBeVisible();
	await filter.fill("");
	await expect(settingsPage.locator("tr.my-palette-shortcuts__row:visible")).toHaveCount(9);

	// Only the changed binding is kept after a reload, and it works in the palette.
	await key.click();
	await settingsPage.keyboard.press("Alt+n");
	await expect(key).toHaveText("Alt+N");
	await settingsPage.screenshot({ path: testInfo.outputPath("shortcuts.png") });
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
