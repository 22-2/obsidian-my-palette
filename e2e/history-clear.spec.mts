import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import {
	closePalette,
	menuItems,
	MODAL_ROW,
	openPaletteWith,
	PLUGIN_ID,
	pluginVaultOptions,
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

test("Clear search history takes two presses and clears only the palette's own history", async ({
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
		"Help",
		"Move to right sidebar",
		"Clear search history",
		"Options",
		"Highlight search matches",
	]);

	// The first press asks for a second press and keeps the menu open.
	await menuItems(page).filter({ hasText: "Clear search history" }).click();
	const confirm = page.locator(".menu-item").filter({ hasText: "Click again to clear" });
	await expect(confirm).toHaveClass(/mod-cta/);
	await expect(page.locator(".menu")).toHaveCount(1);
	expect(await storedCount(obsidian, "file")).toBe(1);

	// The second press clears the palette's categories and closes the menu.
	await confirm.click();
	await expect(page.locator(".menu")).toHaveCount(0);
	expect(await storedCount(obsidian, "file")).toBe(0);
	expect(await storedCount(obsidian, "tag-insertion")).toBe(1);
});

test("moving to another item cancels the confirmation", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "");
	await page.locator(".my-palette-suggest-modal .my-palette-options-button").click();
	await menuItems(page).filter({ hasText: "Clear search history" }).click();
	await expect(menuItems(page).filter({ hasText: "Click again to clear" })).toBeVisible();

	await page.locator(".menu-item").filter({ hasText: "Help" }).hover();
	await expect(menuItems(page).filter({ hasText: "Clear search history" })).toBeVisible();
	await expect(
		page.locator(".menu-item").filter({ hasText: "Clear search history" }),
	).not.toHaveClass(/mod-cta/);
});
