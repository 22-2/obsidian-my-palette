import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import {
	closePalette,
	MODAL_INPUT,
	openPaletteWith,
	PLUGIN_ID,
	pluginVaultOptions,
	runPaletteCommand,
	t,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

type PaletteOpenerHost = { paletteOpener: { now: () => number } };
type HomeSettings = { home: { returnAfterSeconds: number } };

test.beforeEach(async ({ obsidian }) => {
	await obsidian.createNote("Alpha plan.md", "# Alpha");
});

/** Moves the palette's clock forward, which is how Return to Home after is tested. */
function advanceClock(obsidian: ObsidianAPI, milliseconds: number): Promise<void> {
	return obsidian.evaluatePlugin<void, PaletteOpenerHost, number>(
		PLUGIN_ID,
		(plugin, offset) => {
			const real = plugin.paletteOpener.now;
			plugin.paletteOpener.now = () => real() + offset;
		},
		milliseconds,
	);
}

test("Open home resumes the last search, then starts at Home once the time has passed", async ({
	obsidian,
}) => {
	const first = await openPaletteWith(obsidian, "alpha");
	await expect(first.locator(MODAL_INPUT)).toHaveValue("alpha");
	await closePalette(first);

	await runPaletteCommand(obsidian, "open-home");
	const resumed = obsidian.page.locator(MODAL_INPUT);
	await expect(resumed).toHaveValue("alpha");
	// The restored query is selected, so typing replaces it.
	await expect
		.poll(() =>
			resumed.evaluate(
				(input: HTMLInputElement) =>
					(input.selectionEnd ?? 0) - (input.selectionStart ?? 0),
			),
		)
		.toBe(5);
	await closePalette(obsidian.page);

	await advanceClock(obsidian, 91_000);
	await runPaletteCommand(obsidian, "open-home");
	await expect(obsidian.page.locator(MODAL_INPUT)).toHaveValue("");
});

test("Immediately always starts at Home", async ({ obsidian }) => {
	// Changes only the live setting, without saving data.json, as this test did before the migration.
	await obsidian.evaluatePlugin<void, { settings: HomeSettings }>(PLUGIN_ID, (plugin) => {
		plugin.settings.home.returnAfterSeconds = 0;
	});

	const first = await openPaletteWith(obsidian, "alpha");
	await closePalette(first);
	await runPaletteCommand(obsidian, "open-home");
	await expect(obsidian.page.locator(MODAL_INPUT)).toHaveValue("");
});

test("General offers Return to Home after, set to 90 seconds by default", async ({ obsidian }) => {
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, {
		subPage: t("settings.general.name"),
	});
	const row = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText(t("settings.returnHome.name"), { exact: true }) });
	const select = row.locator("select").first();
	await expect(select).toHaveValue("90");
	await select.selectOption("0");
	await expect
		.poll(async () => {
			const settings = await obsidian.pluginSettings<HomeSettings>(PLUGIN_ID);
			return settings.home.returnAfterSeconds;
		})
		.toBe(0);
});

test("mode commands resume only their own recent search", async ({ obsidian }) => {
	await obsidian.evaluatePlugin(
		PLUGIN_ID,
		(plugin: {
			integrationAvailability: object;
			providers: { everything: { search: () => Promise<unknown[]> } };
		}) => {
			Object.defineProperty(plugin.integrationAvailability, "current", {
				get: () => ({ everything: true, smartConnections: false }),
			});
			plugin.providers.everything.search = async () => [];
		},
	);
	await runPaletteCommand(obsidian, "open-everything-list");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await expect(page.locator(".my-palette-suggest-modal")).toHaveAttribute(
		"data-mode",
		"everything",
	);
	await input.fill("example");
	await closePalette(page);
	await runPaletteCommand(obsidian, "open-everything-list");
	await expect(input).toHaveValue("example");
	await expect(page.locator(".my-palette-suggest-modal")).toHaveAttribute(
		"data-mode",
		"everything",
	);
	await closePalette(page);
	await runPaletteCommand(obsidian, "open-run-list");
	await expect(page.locator(".my-palette-suggest-modal")).toHaveAttribute("data-mode", "command");
	await expect(input).toHaveValue("");
	await input.fill("alpha");
	await closePalette(page);
	await runPaletteCommand(obsidian, "open-run-list");
	await expect(input).toHaveValue("alpha");
	await input.press("Escape");
	await expect(input).toHaveValue("");
	await closePalette(page);
	await runPaletteCommand(obsidian, "open-run-list");
	await expect(input).toHaveValue("");
});

test("mode commands start empty after the restore period", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-run-list");
	const input = obsidian.page.locator(MODAL_INPUT);
	await input.fill("alpha");
	await closePalette(obsidian.page);
	await advanceClock(obsidian, 91_000);
	await runPaletteCommand(obsidian, "open-run-list");
	await expect(input).toHaveValue("");
});

test("Home resumes a mode after its alias changes", async ({ obsidian }) => {
	await runPaletteCommand(obsidian, "open-run-list");
	const input = obsidian.page.locator(MODAL_INPUT);
	await input.fill("alpha");
	await closePalette(obsidian.page);
	await obsidian.evaluatePlugin(
		PLUGIN_ID,
		(plugin: { settings: { modes: { commands: { alias: string } } } }) => {
			plugin.settings.modes.commands.alias = "changed";
		},
	);
	await runPaletteCommand(obsidian, "open-home");
	await expect(input).toHaveValue("alpha");
	await expect(obsidian.page.locator(".my-palette-mode-chip")).toHaveText("changed");
});
