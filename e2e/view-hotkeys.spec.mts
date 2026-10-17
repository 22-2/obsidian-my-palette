import { expect, test } from "./fixtures.mts";
import { PLUGIN_ID, pluginVaultOptions, runPaletteCommand } from "./support.mts";
import type { PaletteHotkeys } from "../src/ui/hotkeys";

type ShortcutSettings = { settings: { hotkeys: PaletteHotkeys } };

test.use({ vaultOptions: pluginVaultOptions() });

for (const [surface, command] of [
	["sidebar", "open-sidebar-palette"],
	["table", "open-table-palette"],
] as const) {
	test(`${surface} shortcuts take priority over Obsidian hotkeys only inside the view`, async ({
		obsidian,
	}) => {
		await obsidian.createNote("Alpha.md", "# Alpha");
		await obsidian.open("Alpha.md");
		await runPaletteCommand(obsidian, command);
		const page = obsidian.page;
		const input = page.locator(".my-palette-view .prompt-input");
		await input.fill("alpha");
		await input.press("Control+o");
		await expect(page.getByRole("menu")).toBeVisible();
		await expect(page.locator(".modal-container .prompt-input")).toHaveCount(0);
		await page.keyboard.press("Escape");
		await expect(input).toBeFocused();

		// A changed binding must also win over an existing Obsidian shortcut.
		await obsidian.evaluatePlugin<void, ShortcutSettings>(PLUGIN_ID, (plugin) => {
			plugin.settings.hotkeys.optionsMenu = { key: "P", modifiers: ["Ctrl"] };
		});
		await input.press("Control+p");
		await expect(page.getByRole("menu")).toBeVisible();
		await expect(page.locator(".modal-container .prompt-input")).toHaveCount(0);
		await page.keyboard.press("Escape");

		// Unassigned shortcuts continue to reach Obsidian from the same input.
		await input.press("Control+o");
		await expect(page.locator(".modal-container .prompt-input")).toBeVisible();
		await page.keyboard.press("Escape");
		await input.click();
		await obsidian.evaluatePlugin<void, ShortcutSettings>(PLUGIN_ID, (plugin) => {
			plugin.settings.hotkeys.optionsMenu = null;
		});
		await input.press("Control+p");
		await expect(page.locator(".modal-container .prompt-input")).toBeVisible();
		await page.keyboard.press("Escape");

		// The note pane keeps its normal shortcuts after focus leaves the palette.
		await obsidian.evaluatePlugin<void, ShortcutSettings>(PLUGIN_ID, (plugin) => {
			plugin.settings.hotkeys.optionsMenu = { key: "O", modifiers: ["Ctrl"] };
		});
		await obsidian.evaluateApp(async () => {
			await app.workspace.revealLeaf(app.workspace.getLeavesOfType("markdown")[0]);
		});
		await page.locator('.workspace-leaf-content[data-type="markdown"] .cm-content').click();
		await page.keyboard.press("Control+o");
		await expect(page.locator(".modal-container .prompt-input")).toBeVisible();
	});
}
