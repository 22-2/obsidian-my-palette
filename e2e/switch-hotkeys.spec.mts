import { expect, test } from "obsidian-e2e-toolkit";
import {
	MODAL_INPUT,
	openPaletteWith,
	pluginVaultOptions,
	setIgnoreFilters,
	writeRaw,
} from "./support.mts";

test.use({
	vaultOptions: pluginVaultOptions({
		hotkeys: { toggleIgnored: { key: "J", modifiers: ["Ctrl"] } },
	}),
});

test.beforeEach(async ({ obsidian }) => {
	await obsidian.waitReady();
	await writeRaw(obsidian, "hidden-dir/Secret plan.md", "# Secret");
	await setIgnoreFilters(obsidian, ["hidden-dir"]);
});

const IGNORED_TOGGLE = '.my-palette-status-toggle[data-status-toggle="include-ignored"]';

test("a changed Obsidian-excluded hotkey replaces the footer hint and the shortcut", async ({
	obsidian,
}) => {
	const page = await openPaletteWith(obsidian, "secret");
	await expect(page.locator(`${IGNORED_TOGGLE} .my-palette-status-toggle__hint`)).toHaveText(
		"Ctrl+J",
	);

	// The default Ctrl+I no longer flips the switch.
	await page.locator(MODAL_INPUT).press("Control+I");
	await expect(page.locator(IGNORED_TOGGLE)).toHaveAttribute("aria-checked", "false");

	await page.locator(MODAL_INPUT).press("Control+J");
	await expect(page.locator(IGNORED_TOGGLE)).toHaveAttribute("aria-checked", "true");
});
