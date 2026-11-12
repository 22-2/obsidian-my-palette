import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import {
	closePalette,
	confirmPalette,
	menuItems,
	MODAL_ROW,
	openPaletteWith,
	PLUGIN_ID,
	pluginVaultOptions,
	t,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

type HistoryHost = {
	getSearchHistorySuggestions(input: string, category: string): unknown[];
	recordSearch(input: string, category: string): void;
};

test.beforeEach(async ({ obsidian }) => {
	await obsidian.createNote("Alpha plan.md", "# Alpha");
});

/** Counts the stored history entries of one category through the plugin. */
function storedCount(obsidian: ObsidianAPI, category: string): Promise<number> {
	return obsidian.evaluatePlugin<number, HistoryHost, string>(
		PLUGIN_ID,
		(plugin, kind) => plugin.getSearchHistorySuggestions("", kind).length,
		category,
	);
}

test("Clear search history asks for confirmation and clears only the palette's own history", async ({
	obsidian,
}) => {
	// A selector's history lives in its own category and must survive the palette's clear.
	await obsidian.evaluatePlugin<void, HistoryHost>(PLUGIN_ID, (plugin) =>
		plugin.recordSearch("tagged", "tag-insertion"),
	);

	// Commit a palette search: history is recorded once the result list takes focus.
	const first = await openPaletteWith(obsidian, "alpha");
	await expect(first.locator(MODAL_ROW).first()).toContainText("Alpha plan");
	await first.locator(MODAL_ROW).first().click({ button: "right" });
	await first.keyboard.press("Escape");
	await closePalette(first);
	await expect.poll(() => storedCount(obsidian, "file")).toBe(1);

	const page = await openPaletteWith(obsidian, "");
	await page.locator(".my-palette-suggest-modal .my-palette-options-button").click();
	expect(await menuItems(page).allTextContents()).toEqual([
		t("menu.foldKana"),
		t("palette.ignored.label"),
		t("menu.openableFilesOnly"),
		t("menu.moveToRightSidebar"),
		t("menu.openPluginSettings"),
		t("menu.help"),
		t("palette.control.clearHistory"),
	]);

	// The menu item opens the confirmation palette; nothing is cleared yet.
	await menuItems(page)
		.filter({ hasText: t("palette.control.clearHistory") })
		.click();
	await expect(confirmPalette(page)).toBeVisible();
	expect(await storedCount(obsidian, "file")).toBe(1);

	// Ctrl+Enter clears the palette's categories and closes the confirmation.
	await page.keyboard.press("Control+Enter");
	await expect(confirmPalette(page)).toBeHidden();
	expect(await storedCount(obsidian, "file")).toBe(0);
	expect(await storedCount(obsidian, "tag-insertion")).toBe(1);
});

test("cancelling the confirmation keeps the history", async ({ obsidian }) => {
	const first = await openPaletteWith(obsidian, "alpha");
	await expect(first.locator(MODAL_ROW).first()).toContainText("Alpha plan");
	await first.locator(MODAL_ROW).first().click({ button: "right" });
	await first.keyboard.press("Escape");
	await closePalette(first);
	await expect.poll(() => storedCount(obsidian, "file")).toBe(1);

	const page = await openPaletteWith(obsidian, "");
	await page.locator(".my-palette-suggest-modal .my-palette-options-button").click();
	await menuItems(page)
		.filter({ hasText: t("palette.control.clearHistory") })
		.click();
	await expect(confirmPalette(page)).toBeVisible();

	await page.keyboard.press("Escape");
	await expect(confirmPalette(page)).toBeHidden();
	expect(await storedCount(obsidian, "file")).toBe(1);
});
