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
	// Rows are grouped by the places they work in, and each heading names those places.
	const groups = settingsPage.locator("tbody.my-palette-shortcuts__group");
	const groupHeading = (name: string) =>
		settingsPage.getByRole("rowheader", { name, exact: true });
	await expect(groups).toHaveCount(4);
	await expect(groupHeading("All palettes and selectors")).toBeVisible();
	await expect(groupHeading("Palette, Tag insert selector, MOC insert selector")).toContainText(
		"MOC +",
	);
	const toggleSelection = row("Toggle selection");
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
	// Places live in group headings, so even a narrow table fits without scrolling.
	for (const width of [320, 570, 640]) {
		await resizeTable(width);
		await expectContained();
		const widths = await scroller.evaluate((element) => ({
			width: element.clientWidth,
			content: element.scrollWidth,
		}));
		expect(widths.content).toBeLessThanOrEqual(widths.width + 1);
		await expect(toggleSelection.locator(".my-palette-shortcuts__key")).toBeInViewport();
		await body.screenshot({ path: testInfo.outputPath(`shortcuts-${width}.png`) });
	}
	await resizeTable(570);

	// The place filter keeps the groups that work there, with shortcuts used everywhere.
	const placeFilter = settingsPage.getByRole("combobox", { name: "Filter by place" });
	await placeFilter.selectOption("MOC remove selector");
	await expect(groups.filter({ visible: true })).toHaveCount(2);
	await expect(row("Preview selected result")).toBeHidden();
	await expect(toggleSelection).toBeVisible();
	await expect(settingsPage.locator(".my-palette-shortcuts__place.is-match")).toHaveText("MOC −");
	await body.screenshot({ path: testInfo.outputPath("shortcuts-moc-remove.png") });
	await placeFilter.selectOption("All places");
	await expect(groups.filter({ visible: true })).toHaveCount(4);

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
	await filter.fill("history");
	await expect(settingsPage.locator("tr.my-palette-shortcuts__row:visible")).toHaveCount(1);
	await expect(row("Search history")).toBeVisible();
	await filter.fill("");
	await expect(settingsPage.locator("tr.my-palette-shortcuts__row:visible")).toHaveCount(8);

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
