import { expect, test } from "./fixtures.mts";
import {
	MODAL_INPUT,
	MODAL_ROW,
	menuItems,
	openHomeWith,
	PLUGIN_ID,
	pluginVaultOptions,
	rowLabels,
	runPaletteCommand,
	waitForResolvedLinks,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

type SmartConnectionsHost = {
	integrationAvailability: { refresh(): Promise<unknown> };
};

test("an installed but uninitialized Smart Connections mode stays hidden until its adapter is ready", async ({
	obsidian,
}) => {
	await obsidian.createNote("Origin.md", "# Origin");
	await obsidian.open("Origin.md");
	await obsidian.evaluateApp(() => {
		const plugins = (app as unknown as { plugins: { plugins: Record<string, unknown> } })
			.plugins.plugins;
		plugins["smart-connections"] = { env: { smart_sources: {} } };
	});
	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Related notes" })).toHaveCount(0);
	await obsidian.evaluateApp(() => {
		const plugins = (app as unknown as { plugins: { plugins: Record<string, unknown> } })
			.plugins.plugins;
		plugins["smart-connections"] = {
			env: {
				smart_sources: {
					get: () => ({ vec: [1] }),
					entities_vector_adapter: { nearest: async () => [] },
				},
			},
		};
	});
	await obsidian.evaluatePlugin<unknown, SmartConnectionsHost>(PLUGIN_ID, (plugin) =>
		plugin.integrationAvailability.refresh(),
	);
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Related notes" })).toHaveCount(1);
	await page.locator(MODAL_INPUT).fill("sc ");
	await expect(page.locator(".my-palette-mode-chip")).toHaveText("sc");
	await expect(page.locator(".suggestion-empty")).toContainText("No suggestions");
});

test("returning to Home restores the selected mode", async ({ obsidian }) => {
	const page = await openHomeWith(obsidian, "");
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(MODAL_ROW).nth(1)).toContainText("コマンド");
	await input.press("ArrowDown");
	await input.press("Enter");
	await expect(page.locator(".my-palette-mode-chip")).toBeVisible();
	await input.press("Escape");
	await expect(input).toHaveValue("");
	await expect(page.locator(`${MODAL_ROW}.is-active`)).toContainText("コマンド");
});

test("the > prefix searches commands", async ({ obsidian }) => {
	const page = await openHomeWith(obsidian, "> outgoing link list");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Open outgoing link list");
});

for (const { mode, input, row } of [
	{ mode: "Plugins", input: "p my palette", row: "My Palette" },
	{ mode: "Snippets", input: "sn ", row: "snippets" },
]) {
	test(`Enter opens the row menu in ${mode}`, async ({ obsidian }) => {
		const page = await openHomeWith(obsidian, input);
		await expect(page.locator(MODAL_ROW).first()).toContainText(row, { ignoreCase: true });
		await page.locator(MODAL_INPUT).press("Enter");
		await expect(
			page.locator(".menu .menu-item").filter({ hasText: "Open in external editor" }),
		).toBeVisible();
		// The palette stays open behind the menu, so Esc returns to the list.
		await expect(page.locator(MODAL_INPUT)).toBeAttached();
	});
}

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
	const page = await openHomeWith(obsidian, "bk pinned");
	await expect(page.locator(MODAL_ROW).first()).toContainText("Pinned topic");
});

test("o lists outgoing links and b lists backlinks of the active note", async ({ obsidian }) => {
	await obsidian.createNote("Hub.md", "see [[Target one]] and [[Target two]]");
	await obsidian.createNote("Target one.md", "one");
	await obsidian.createNote("Target two.md", "two");
	await obsidian.createNote("Referrer.md", "points to [[Hub]]");
	await waitForResolvedLinks(obsidian, {
		"Hub.md": ["Target one.md", "Target two.md"],
		"Referrer.md": ["Hub.md"],
	});
	await obsidian.open("Hub.md");

	const page = await openHomeWith(obsidian, "o ");
	await expect
		.poll(() => rowLabels(page))
		.toEqual(expect.arrayContaining(["Target one", "Target two"]));

	// Esc leaves the outgoing-link mode for Home before entering backlinks.
	await page.locator(MODAL_INPUT).press("Escape");
	await expect(page.locator(MODAL_INPUT)).toHaveValue("");
	await page.locator(MODAL_INPUT).fill("b ");
	await expect.poll(() => rowLabels(page)).toEqual(["Referrer"]);
});

test("an unavailable Smart Connections mode is absent and its alias does not enter a mode", async ({
	obsidian,
}) => {
	await obsidian.createNote("Solo.md", "alone");
	await obsidian.open("Solo.md");
	const page = await openHomeWith(obsidian, "sc ");
	await expect(page.locator(".my-palette-mode-chip")).toBeHidden();
	await expect(page.locator(MODAL_INPUT)).toHaveValue("sc ");
	await expect(page.locator(MODAL_ROW).filter({ hasText: "Related notes" })).toHaveCount(0);
});

test("a Home mode can be hidden and restored from its settings page", async ({ obsidian }) => {
	const page = await openHomeWith(obsidian, "ノート");
	const notesRow = page.locator(MODAL_ROW).filter({ hasText: "ノート" }).first();
	await expect(notesRow).toBeVisible();
	await notesRow.click({ button: "right" });
	await menuItems(page).filter({ hasText: "モードを非表示にする" }).click();
	await expect(page.locator(MODAL_ROW).filter({ hasText: "ノート" })).toHaveCount(0);

	const input = page.locator(MODAL_INPUT);
	await input.fill("n ");
	await expect(page.locator(".my-palette-mode-chip")).toBeHidden();
	await expect(input).toHaveValue("n ");

	await page.locator(".my-palette-options-button").click();
	await menuItems(page).filter({ hasText: "プラグインの設定を開く" }).click();
	await expect(input).toHaveCount(0);
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				() =>
					(app as unknown as { setting: { activeTab?: { id?: string } } }).setting
						.activeTab?.id,
			),
		)
		.toBe(PLUGIN_ID);
	await obsidian.closeSettings();

	const settingsPage = await obsidian.openSettings(PLUGIN_ID, { subPage: "モード" });
	const notesSetting = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("ノート", { exact: true }) });
	await notesSetting.locator(".checkbox-container").click();
	await expect
		.poll(() => obsidian.pluginSettings<{ modes: { notes: { enabled: boolean } } }>(PLUGIN_ID))
		.toMatchObject({ modes: { notes: { enabled: true } } });
	await obsidian.closeSettings();

	await runPaletteCommand(obsidian, "open-home");
	const restoredPage = obsidian.page;
	await restoredPage.locator(MODAL_INPUT).pressSequentially("n ");
	await expect(restoredPage.locator(".my-palette-mode-chip")).toHaveText("n");
});
