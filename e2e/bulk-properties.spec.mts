import { expect, test } from "./fixtures.mts";
import { MODAL_INPUT, MODAL_ROW, openPaletteWith, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

const NOTES = ["Bulk A.md", "Bulk B.md", "Bulk C.md"];

test.beforeEach(async ({ obsidian }) => {
	await obsidian.createNote("Bulk A.md", "---\ntopic:\n  - x\n---\nbody");
	await obsidian.createNote("Bulk B.md", "---\ntopic:\n  - x\n  - y\n---\nbody");
	await obsidian.createNote("Bulk C.md", "body only");
	// Properties read the metadata cache, which fills in a moment after a note is created.
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					["Bulk A.md", "Bulk B.md", "Bulk C.md"].filter((path) => {
						const file = app.vault.getFileByPath(path);
						return file && app.metadataCache.getFileCache(file);
					}).length,
			),
		)
		.toBe(3);
	await expect
		.poll(() =>
			obsidian.evaluateApp(() => {
				const file = app.vault.getFileByPath("Bulk B.md");
				return file ? app.metadataCache.getFileCache(file)?.frontmatter?.topic : undefined;
			}),
		)
		.toEqual(["x", "y"]);
});

/** Selects the three notes in the palette and opens Properties for them from the row menu. */
async function openPropertiesForAll(obsidian: Parameters<typeof openPaletteWith>[0]) {
	const page = await openPaletteWith(obsidian, "Bulk");
	await expect(page.locator(MODAL_ROW)).toHaveCount(3);
	await page.locator(MODAL_ROW).nth(0).click();
	await page
		.locator(MODAL_ROW)
		.nth(2)
		.click({ modifiers: ["Shift"] });
	await page.locator(MODAL_ROW).nth(1).click({ button: "right" });
	await expect(page.locator(".menu .menu-item").first()).toContainText("3 items selected");
	await page.locator(".menu .menu-item").filter({ hasText: "Edit properties…" }).click();
	await expect(page.locator(".my-palette-suggest-modal")).toContainText("Source: 3 notes");
	return page;
}

test("a value typed in the list selector is added to every selected note", async ({ obsidian }) => {
	const page = await openPropertiesForAll(obsidian);
	await page.locator(MODAL_INPUT).fill("topic");
	await expect(page.locator(MODAL_ROW).first()).toContainText("2/3 notes");
	await page.locator(MODAL_INPUT).press("Enter");

	// Property value selector: "x" is on two of the three notes, "y" on one.
	const selector = page.locator(".my-palette-suggest-modal").last();
	await expect(selector).toContainText("On 2/3 notes");
	await page.locator(MODAL_INPUT).last().fill("z");
	await page.locator(MODAL_INPUT).last().press("Enter");

	for (const note of NOTES) {
		await expect.poll(() => obsidian.read(note)).toContain("- z");
	}
	expect(await obsidian.read("Bulk A.md")).toContain("- x");
	expect(await obsidian.read("Bulk B.md")).toContain("- y");
});

test("deleting a key needs a second press and only touches the notes that have it", async ({
	obsidian,
}) => {
	const page = await openPropertiesForAll(obsidian);
	await page.locator(MODAL_INPUT).fill("topic");
	await expect(page.locator(MODAL_ROW)).toHaveCount(1);
	await expect(page.locator(MODAL_ROW).first()).toContainText("2/3 notes");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	const del = page
		.locator(".menu .menu-item")
		.filter({ hasText: "Delete property from 3 notes" });
	await del.click();
	await expect(page.locator(".menu .menu-item.mod-cta")).toContainText(
		"Click again to delete from 3 notes",
	);
	expect(await obsidian.read("Bulk A.md")).toContain("topic");

	await page.locator(".menu .menu-item.mod-cta").click();
	for (const note of NOTES.slice(0, 2)) {
		await expect.poll(() => obsidian.read(note)).not.toContain("topic");
	}
	expect(await obsidian.read("Bulk C.md")).toBe("body only");
});
