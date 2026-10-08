import { expect, test } from "obsidian-e2e-toolkit";
import {
	activeFilePath,
	closePalette,
	createNote,
	menuItems,
	MODAL_INPUT,
	MODAL_ROW,
	openNote,
	openPaletteWith,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await createNote(obsidian.page, "Alpha plan.md", "# Alpha");
	await createNote(obsidian.page, "Beta notes.md", "# Beta");
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
	const page = obsidian.page;
	await openNote(page, "Beta notes.md");
	await openPaletteWith(obsidian, "alpha");
	await page.locator(MODAL_ROW).first().click({ button: "middle" });
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as any).app.workspace
					.getLeavesOfType("markdown")
					.map((leaf: any) => leaf.view.file?.path)
					.sort(),
			),
		)
		.toEqual(["Alpha plan.md", "Beta notes.md"]);
	expect(await activeFilePath(page)).toBe("Beta notes.md");
});
