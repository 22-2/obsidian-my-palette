import { expect, test } from "obsidian-e2e-toolkit";
import type { ObsidianAPI } from "obsidian-e2e-toolkit";
import {
	closePalette,
	MODAL_INPUT,
	openPaletteWith,
	PLUGIN_ID,
	pluginVaultOptions,
	runPaletteCommand,
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
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, { subPage: "General" });
	const row = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("Return to Home after", { exact: true }) });
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
