import path from "node:path";
import { expect, test } from "obsidian-e2e-toolkit";

test.use({
	vaultOptions: { plugins: [{ path: path.resolve(".e2e/plugin") }] },
});

test("the plugin loads and registers its commands", async ({ obsidian }) => {
	await obsidian.waitReady();
	expect(await obsidian.isPluginEnabled("my-palette")).toBe(true);
});
