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

test("moves the current modal search into a fresh sidebar pane", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-view");
	const page = obsidian.page;
	const sidebarInputs = page.locator(".my-palette-view .prompt-input");
	await sidebarInputs.first().fill("beta");
	await openPaletteWith(obsidian, "alpha");
	await page.locator(".my-palette-suggest-modal .my-palette-options-button").click();
	await menuItems(page)
		.filter({ hasText: /^Move to right sidebar$/ })
		.click();
	await expect(page.locator(MODAL_INPUT)).toHaveCount(0);
	await expect(sidebarInputs).toHaveCount(2);
	await expect(sidebarInputs.first()).toHaveValue("beta");
	await expect(sidebarInputs.last()).toHaveValue("alpha");
	await expect(sidebarInputs.last()).toBeFocused();
	await expect(page.locator(".my-palette-view").last()).toContainText("Alpha plan");
	await page.locator(".my-palette-view .my-palette-options-button").last().click();
	await expect(menuItems(page).filter({ hasText: /^Move to right sidebar$/ })).toHaveCount(0);
});

test("moving a link search preserves its fixed mode and source note", async ({ obsidian }) => {
	await obsidian.createNote("Source.md", "[[Alpha plan]]");
	await obsidian.open("Source.md");
	await runPaletteCommand(obsidian, "link-search");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).fill("alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha plan");
	await page.locator(".my-palette-suggest-modal .my-palette-options-button").click();
	await menuItems(page)
		.filter({ hasText: /^Move to right sidebar$/ })
		.click();
	await expect(page.locator(MODAL_INPUT)).toHaveCount(0);
	await expect(page.locator(".my-palette-view .prompt-input")).toHaveValue("alpha");
	await expect(page.locator(".my-palette-view")).toHaveAttribute("data-mode", "link");
	await expect(page.locator(".my-palette-view .suggestion-item")).toContainText("Alpha plan");
});

test("middle click opens a background tab and keeps the current note", async ({ obsidian }) => {
	await obsidian.open("Beta notes.md");
	const page = await openPaletteWith(obsidian, "alpha");
	// Wait for the filtered row: clicking while the list still shows an earlier
	// query would hit a row that is about to be replaced.
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha plan");
	await page.locator(MODAL_ROW).first().click({ button: "middle" });
	await expect
		.poll(async () =>
			(await obsidian.allTabs())
				.filter((tab) => tab.viewType === "markdown")
				.map((tab) => tab.filePath)
				.sort(),
		)
		.toEqual(["Alpha plan.md", "Beta notes.md"]);
	expect((await obsidian.activeTab())?.filePath).toBe("Beta notes.md");
});
