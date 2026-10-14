import { expect, test } from "./fixtures.mts";
import { MODAL_INPUT, openPaletteWith, PLUGIN_ID, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("the Shortcuts table records changes, rejects conflicts and restores defaults", async ({
	obsidian,
}, testInfo) => {
	const page = obsidian.page;
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, { subPage: "Shortcuts" });

	const row = (name: string) =>
		settingsPage.locator("tr.my-palette-shortcuts__row").filter({
			has: settingsPage.getByText(name, { exact: true }),
		});
	const hidePreview = row("Hide palette or selector");
	const key = hidePreview.locator(".my-palette-shortcuts__key");
	// Everywhere reads as one cell; a narrower shortcut marks each place with a dot.
	await expect(hidePreview).toContainText("All palettes and selectors");
	await expect(hidePreview.locator(".my-palette-shortcuts__dot")).toHaveCount(0);
	const preview = row("Preview selected result");
	await expect(preview.locator(".my-palette-shortcuts__dot")).toHaveCount(4);
	await expect(preview.getByRole("img", { name: "MOC remove selector" })).toBeVisible();
	await expect(key).toHaveText("Alt+H");
	await expect(hidePreview.getByRole("button", { name: "Reset" })).toBeHidden();

	const body = settingsPage.locator(".my-palette-shortcuts__body");
	const scroller = settingsPage.locator(".my-palette-shortcuts__scroller");
	await settingsPage.setViewportSize({ width: 1100, height: 800 });
	const resizeTable = async (width: number) => {
		await settingsPage
			.locator(".setting-item.my-palette-shortcuts")
			.evaluate((element, width) => {
				const style = getComputedStyle(element);
				element.style.maxWidth = `${width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)}px`;
			}, width);
		await expect.poll(() => body.evaluate((element) => element.clientWidth)).toBe(width);
	};
	const expectContained = async () => {
		const widths = await body.evaluate((element) => ({
			width: element.clientWidth,
			content: element.scrollWidth,
		}));
		expect(widths.content).toBeLessThanOrEqual(widths.width + 1);
	};
	// Test the content width independently of Obsidian's settings navigation sidebar.
	for (const width of [570, 640]) {
		await resizeTable(width);
		await expectContained();
		const widths = await scroller.evaluate((element) => ({
			width: element.clientWidth,
			content: element.scrollWidth,
		}));
		expect(widths.content).toBeLessThanOrEqual(widths.width + 1);
		await body.screenshot({ path: testInfo.outputPath(`shortcuts-${width}.png`) });
	}
	// At smaller widths, only the table scrolls, including its last scope and Reset column.
	await resizeTable(320);
	await expectContained();
	await scroller.evaluate((element) => {
		element.scrollLeft = element.scrollWidth;
	});
	await expect(preview.getByRole("img", { name: "MOC remove selector" })).toBeInViewport();
	await body.screenshot({ path: testInfo.outputPath("shortcuts-narrow.png") });
	await resizeTable(570);
	await scroller.evaluate((element) => {
		element.scrollLeft = 0;
	});

	// Recording starts on click; Escape cancels and keeps the binding.
	await key.click();
	await expect(key).toHaveText("Press a shortcut…");
	await expectContained();
	await settingsPage.keyboard.press("Escape");
	await expect(key).toHaveText("Alt+H");

	// A long binding and its Reset button must fit in the same default-size table.
	await key.click();
	await settingsPage.keyboard.press("Control+Alt+Shift+n");
	await expect(key).toHaveText("Ctrl+Alt+Shift+N");
	await expectContained();
	await expect(hidePreview.getByRole("button", { name: "Reset" })).toBeInViewport();
	await body.screenshot({ path: testInfo.outputPath("shortcuts-long-binding.png") });
	await hidePreview.getByRole("button", { name: "Reset" }).click();
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
