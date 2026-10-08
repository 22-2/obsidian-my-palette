import { expect, test } from "obsidian-e2e-toolkit";
import {
	closePalette,
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await obsidian.createNote("Alpha plan.md", "# Alpha");
	await obsidian.createNote("Beta notes.md", "# Beta");
});

test("a committed search shows up in the history and restores its input", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha plan");
	// History is committed once the result list takes focus, not while typing.
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await page.keyboard.press("Escape");
	await closePalette(page);

	await runPaletteCommand(obsidian, "open");
	await page.locator(MODAL_INPUT).waitFor();
	await page.keyboard.press("Control+r");
	const history = page.locator(".my-palette-history-suggest");
	await expect(history).not.toHaveClass(/is-hidden/);
	await expect(history).toContainText("alpha");
	await history.getByText("alpha").first().click();
	await expect(page.locator(MODAL_INPUT)).toHaveValue("alpha");
});

test("right click offers the open actions", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "alpha");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await expect(menuItems(page).filter({ hasText: /^Open$/ })).toBeVisible();
	await expect(menuItems(page).filter({ hasText: "Open in new tab (background)" })).toBeVisible();
	await expect(menuItems(page).filter({ hasText: "Open side by side" })).toBeVisible();
});

test("middle click opens a background tab and keeps the current note", async ({ obsidian }) => {
	await obsidian.open("Beta notes.md");
	const page = await openPaletteWith(obsidian, "alpha");
	// Wait for the filtered row: clicking while the list still shows an earlier
	// query would hit a row that is about to be replaced.
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha plan");
	await page.locator(MODAL_ROW).first().click({ button: "middle" });
	// Background tabs are matched through the workspace, not allTabs(), which can miss them.
	const openNotes = () =>
		obsidian.evaluateApp(() =>
			app.workspace
				.getLeavesOfType("markdown")
				.map((leaf) => (leaf.getViewState().state as { file?: string }).file)
				.sort(),
		);
	await expect.poll(openNotes).toEqual(["Alpha plan.md", "Beta notes.md"]);
	expect((await obsidian.activeTab())?.filePath).toBe("Beta notes.md");
});
