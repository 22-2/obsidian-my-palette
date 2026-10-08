import { expect, test } from "obsidian-e2e-toolkit";
import { PLUGIN_ID, pluginVaultOptions } from "./support.mts";

test.use({ vaultOptions: pluginVaultOptions() });

test("the plugin loads and registers its commands", async ({ obsidian }) => {
	await obsidian.waitReady();
	expect(await obsidian.isPluginEnabled(PLUGIN_ID)).toBe(true);
	const commands = await obsidian.evaluateApp(() =>
		Object.keys(app.commands.commands).filter((id) => id.startsWith("my-palette:")),
	);
	expect(commands).toEqual(expect.arrayContaining(["my-palette:open", "my-palette:insert-tags"]));
});
