import { expect, test } from "obsidian-e2e-toolkit";
import { PLUGIN_ID, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("the plugin loads and registers its commands", async ({ obsidian }) => {
	expect(await obsidian.isPluginEnabled(PLUGIN_ID)).toBe(true);
	const commands = await obsidian.findCommands("my-palette:");
	expect(commands).toEqual(
		expect.arrayContaining([
			"my-palette:open-note-list",
			"my-palette:open-tag-insert-selector",
		]),
	);
});
