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

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await obsidian.createNote("Alpha plan.md", "# Alpha");
});

/** Moves the palette's clock forward, which is how Return to Home after is tested. */
function advanceClock(obsidian: ObsidianAPI, milliseconds: number): Promise<void> {
	return obsidian.evaluateApp(
		({ id, milliseconds }) => {
			const plugin = (
				app as unknown as {
					plugins: { plugins: Record<string, { paletteOpener: { now: () => number } }> };
				}
			).plugins.plugins[id];
			const real = plugin.paletteOpener.now;
			plugin.paletteOpener.now = () => real() + milliseconds;
		},
		{ id: PLUGIN_ID, milliseconds },
	);
}

test("Open palette resumes the last search, then starts at Home once the time has passed", async ({
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
	await obsidian.evaluateApp((id) => {
		(
			app as unknown as {
				plugins: {
					plugins: Record<string, { settings: { home: { returnAfterSeconds: number } } }>;
				};
			}
		).plugins.plugins[id].settings.home.returnAfterSeconds = 0;
	}, PLUGIN_ID);

	const first = await openPaletteWith(obsidian, "alpha");
	await closePalette(first);
	await runPaletteCommand(obsidian, "open-home");
	await expect(obsidian.page.locator(MODAL_INPUT)).toHaveValue("");
});

test("General offers Return to Home after, set to 90 seconds by default", async ({ obsidian }) => {
	const settingsOpened = obsidian.page.context().waitForEvent("page");
	await obsidian.evaluateApp(() => {
		const setting = (
			app as unknown as { setting: { open(): void; openTabById(id: string): void } }
		).setting;
		setting.open();
		setting.openTabById("my-palette");
	});
	const settingsPage = await settingsOpened;
	const general = settingsPage.locator(".setting-item-name").filter({ hasText: /^General$/ });
	await expect(general).toBeVisible({ timeout: 10_000 });
	await general.click();
	const row = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("Return to Home after", { exact: true }) });
	const select = row.locator("select").first();
	await expect(select).toHaveValue("90");
	await select.selectOption("0");
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				(id) =>
					(
						app as unknown as {
							plugins: {
								plugins: Record<
									string,
									{ settings: { home: { returnAfterSeconds: number } } }
								>;
							};
						}
					).plugins.plugins[id].settings.home.returnAfterSeconds,
				PLUGIN_ID,
			),
		)
		.toBe(0);
});
