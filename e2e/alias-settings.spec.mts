import { expect, test } from "./fixtures.mts";
import type { ObsidianAPI } from "./fixtures.mts";
import {
	MODAL_INPUT,
	MODAL_ROW,
	PLUGIN_ID,
	pluginVaultOptions,
	runPaletteCommand,
} from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

type CommandAliasSettings = { modes: { commands: { alias: string } } };
type ModeEnabledSettings = { modes: Record<string, { enabled: boolean }> };

async function storedCommandAlias(obsidian: ObsidianAPI): Promise<string> {
	const settings = await obsidian.pluginSettings<CommandAliasSettings>(PLUGIN_ID);
	return settings.modes.commands.alias;
}

async function storedModeEnabled(obsidian: ObsidianAPI, id: string): Promise<boolean> {
	const settings = await obsidian.pluginSettings<ModeEnabledSettings>(PLUGIN_ID);
	return settings.modes[id].enabled;
}

test("mode aliases can be changed on the Modes page and are used in Home", async ({ obsidian }) => {
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, { subPage: "モード" });
	const row = (name: string) =>
		settingsPage
			.locator(".setting-item")
			.filter({ has: settingsPage.getByText(name, { exact: true }) });
	const commandInput = row("コマンド").getByRole("textbox");
	await expect(commandInput).toHaveValue(">");
	// Aliases are stored without a trailing space, so the field shows the alias alone.
	await expect(row("ノート").getByRole("textbox")).toHaveValue("n");

	await commandInput.fill("n");
	await expect(row("コマンド")).toContainText("ほかのモードですでに使われています");
	expect(await storedCommandAlias(obsidian)).toBe(">");

	await commandInput.fill("c");
	await expect.poll(() => storedCommandAlias(obsidian)).toBe("c");
	// Close through Obsidian: closing the window alone leaves the settings modal registered.
	await obsidian.closeSettings();

	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.pressSequentially("c");
	await expect(page.locator(MODAL_ROW).first()).toContainText("コマンド");
	await input.pressSequentially(" outgoing link list");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-mode-chip")).toHaveText("c");
	await expect(input).toHaveValue("outgoing link list");
});

test("a mode turned off on the Modes page leaves Home and alias entry", async ({ obsidian }) => {
	const settingsPage = await obsidian.openSettings(PLUGIN_ID, { subPage: "モード" });
	const bookmarks = settingsPage
		.locator(".setting-item")
		.filter({ has: settingsPage.getByText("ブックマーク", { exact: true }) });
	// Obsidian switches flip when their label is clicked; the input inside is not clickable.
	await bookmarks.locator(".checkbox-container").click();
	await expect.poll(() => storedModeEnabled(obsidian, "bookmarks")).toBe(false);
	await obsidian.closeSettings();

	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	const input = page.locator(MODAL_INPUT);
	await input.waitFor();
	await expect(page.locator(".my-palette-suggest-modal")).not.toContainText("ブックマーク");
	await input.pressSequentially("bk ");
	await expect(page.locator(".my-palette-suggest-modal .my-palette-mode-chip")).toBeHidden();
	await expect(input).toHaveValue("bk ");
});
