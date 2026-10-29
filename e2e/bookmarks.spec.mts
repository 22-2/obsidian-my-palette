import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import {
	MODAL_INPUT,
	MODAL_ROW,
	menuItems,
	openHomeWith,
	openPaletteWith,
	pluginVaultOptions,
	rowLabels,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

interface Entry {
	type: string;
	title?: string;
	path?: string;
	items?: Entry[];
}

/** The core Bookmarks plugin's tree, reduced to the fields the actions change. */
function bookmarkTree(obsidian: ObsidianAPI): Promise<Entry[]> {
	return obsidian.evaluateApp(() => {
		const instance = (
			app as unknown as {
				internalPlugins: { getEnabledPluginById(id: string): { items: Entry[] } };
			}
		).internalPlugins.getEnabledPluginById("bookmarks");
		const strip = (items: Entry[]): Entry[] =>
			items.map(({ type, title, path, items }) => ({
				type,
				...(title ? { title } : {}),
				...(path ? { path } : {}),
				...(items ? { items: strip(items) } : {}),
			}));
		return strip(instance.items);
	});
}

test("files from Notes are bookmarked into a group created from the selector", async ({
	obsidian,
}) => {
	await obsidian.createNote("Alpha.md", "alpha");
	const page = await openPaletteWith(obsidian, "alpha");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Alpha");
	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "ブックマークに追加…" }).click();

	const selectorInput = page.locator(MODAL_INPUT).last();
	await selectorInput.fill("Reading");
	await expect(page.locator(MODAL_ROW).last()).toContainText("新しいグループ: Reading");
	await selectorInput.press("Enter");

	await expect
		.poll(() => bookmarkTree(obsidian))
		.toEqual([
			{ type: "group", title: "Reading", items: [{ type: "file", path: "Alpha.md" }] },
		]);
	// Bookmarking ends the action, so the modal palette closes behind the selector.
	await expect(page.locator(".my-palette-suggest-modal")).toHaveCount(0);
});

test("Bookmarks mode renames, moves and removes a bookmark", async ({ obsidian }) => {
	await obsidian.createNote("Alpha.md", "alpha");
	await obsidian.evaluateApp(() => {
		const instance = (
			app as unknown as {
				internalPlugins: {
					getEnabledPluginById(id: string): {
						addItem(item: unknown, parent?: unknown): void;
					};
				};
			}
		).internalPlugins.getEnabledPluginById("bookmarks");
		const group = { type: "group", title: "Reading", items: [], ctime: 1 };
		instance.addItem(group);
		instance.addItem({ type: "file", path: "Alpha.md", ctime: 1 }, group);
	});

	const page = await openHomeWith(obsidian, "bk ");
	await expect.poll(() => rowLabels(page)).toEqual(["Reading › Alpha.md"]);

	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "ブックマークの名前を変更…" }).click();
	await page.locator(MODAL_INPUT).last().fill("First");
	await page.locator(MODAL_INPUT).last().press("Enter");
	await expect.poll(() => rowLabels(page)).toEqual(["Reading › First"]);

	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "ブックマークのグループへ移動…" }).click();
	await expect(page.locator(MODAL_ROW).last()).toBeVisible();
	await page.locator(MODAL_INPUT).last().press("Enter");
	await expect.poll(() => rowLabels(page)).toEqual(["First"]);
	expect(await bookmarkTree(obsidian)).toEqual([
		{ type: "group", title: "Reading", items: [] },
		{ type: "file", title: "First", path: "Alpha.md" },
	]);

	await page.locator(MODAL_ROW).first().click({ button: "right" });
	await menuItems(page).filter({ hasText: "ブックマークから削除" }).click();
	await expect
		.poll(() => bookmarkTree(obsidian))
		.toEqual([{ type: "group", title: "Reading", items: [] }]);
	await expect.poll(() => rowLabels(page)).toEqual([]);
});
