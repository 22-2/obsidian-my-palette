import { expect, test } from "obsidian-e2e-toolkit";
import {
	createNote,
	MODAL_INPUT,
	MODAL_ROW,
	openNote,
	openPaletteWith,
	pluginVaultOptions,
	rowLabels,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
});

test("the > prefix searches commands", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "> link search");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Link search");
});

test("bk searches core bookmarks", async ({ obsidian }) => {
	const page = obsidian.page;
	await createNote(page, "Pinned topic.md", "# pinned");
	await page.evaluate(() => {
		const bookmarks = (window as any).app.internalPlugins.getEnabledPluginById("bookmarks");
		bookmarks.addItem({ type: "file", path: "Pinned topic.md", title: "Pinned topic" });
	});
	await openPaletteWith(obsidian, "bk pinned");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Pinned topic");
});

test("o lists outgoing links and b lists backlinks of the active note", async ({ obsidian }) => {
	const page = obsidian.page;
	await createNote(page, "Hub.md", "see [[Target one]] and [[Target two]]");
	await createNote(page, "Target one.md", "one");
	await createNote(page, "Target two.md", "two");
	await createNote(page, "Referrer.md", "points to [[Hub]]");
	await openNote(page, "Hub.md");

	await openPaletteWith(obsidian, "o ");
	await expect
		.poll(() => rowLabels(page))
		.toEqual(expect.arrayContaining(["Target one", "Target two"]));

	await page.locator(MODAL_INPUT).fill("b ");
	await expect.poll(() => rowLabels(page)).toEqual(["Referrer"]);
});

test("sc reports clearly when Smart Connections is unavailable", async ({ obsidian }) => {
	const page = obsidian.page;
	await createNote(page, "Solo.md", "alone");
	await openNote(page, "Solo.md");
	await openPaletteWith(obsidian, "sc ");
	await expect(page.locator(".my-palette-suggest-modal")).toContainText(
		"Smart Connections is not enabled",
	);
});
