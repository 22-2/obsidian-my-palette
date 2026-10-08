import { expect, test } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	MODAL_ROW,
	openPaletteWith,
	pluginVaultOptions,
	rowLabels,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
});

test("the > prefix searches commands", async ({ obsidian }) => {
	const page = await openPaletteWith(obsidian, "> link search");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Link search");
});

test("bk searches core bookmarks", async ({ obsidian }) => {
	await obsidian.createNote("Pinned topic.md", "# pinned");
	await obsidian.evaluateApp(() => {
		const bookmarks = (
			app as unknown as {
				internalPlugins: {
					getEnabledPluginById(id: string): { addItem(item: object): void };
				};
			}
		).internalPlugins.getEnabledPluginById("bookmarks");
		bookmarks.addItem({ type: "file", path: "Pinned topic.md", title: "Pinned topic" });
	});
	const page = await openPaletteWith(obsidian, "bk pinned");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Pinned topic");
});

test("o lists outgoing links and b lists backlinks of the active note", async ({ obsidian }) => {
	await obsidian.createNote("Hub.md", "see [[Target one]] and [[Target two]]");
	await obsidian.createNote("Target one.md", "one");
	await obsidian.createNote("Target two.md", "two");
	await obsidian.createNote("Referrer.md", "points to [[Hub]]");
	await obsidian.open("Hub.md");

	const page = await openPaletteWith(obsidian, "o ");
	await expect
		.poll(() => rowLabels(page))
		.toEqual(expect.arrayContaining(["Target one", "Target two"]));

	await page.locator(MODAL_INPUT).fill("b ");
	await expect.poll(() => rowLabels(page)).toEqual(["Referrer"]);
});

test("sc reports clearly when Smart Connections is unavailable", async ({ obsidian }) => {
	await obsidian.createNote("Solo.md", "alone");
	await obsidian.open("Solo.md");
	const page = await openPaletteWith(obsidian, "sc ");
	await expect(page.locator(".my-palette-suggest-modal")).toContainText(
		"Smart Connections is not enabled",
	);
});
