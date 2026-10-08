import { expect, test } from "obsidian-e2e-toolkit";
import {
	activeFilePath,
	createNote,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	rowLabels,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await createNote(obsidian.page, "Projects/Alpha plan.md", "# Alpha");
	await createNote(obsidian.page, "Projects/Beta notes.md", "# Beta");
});

test("file search ranks the matching note first", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "alpha");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1);
	expect(await rowLabels(page)).toEqual(["Alpha plan"]);
	await expect(page.locator(MODAL_ROW).first()).toContainText("Projects/Alpha plan.md");
});

test("Enter opens the selected note in the editor", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "beta");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Beta notes");
	await page.keyboard.press("Enter");
	await expect.poll(() => activeFilePath(page)).toBe("Projects/Beta notes.md");
	await expect(page.locator(".my-palette-suggest-modal")).toHaveCount(0);
});
