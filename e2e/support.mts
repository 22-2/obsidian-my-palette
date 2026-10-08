import path from "node:path";
import type { Page } from "@playwright/test";
import type { ObsidianAPI, VaultOptions } from "obsidian-e2e-toolkit";

export const PLUGIN_ID = "my-palette";
export const pluginVaultOptions: Partial<VaultOptions> = {
	plugins: [{ path: path.resolve(".e2e/plugin") }],
};

export const MODAL_INPUT = ".my-palette-suggest-modal .prompt-input";
export const MODAL_ROW = ".my-palette-suggest-modal .suggestion-item";

/** Runs one of the plugin's registered commands through Obsidian's command registry. */
export async function runPaletteCommand(obsidian: ObsidianAPI, id: string): Promise<void> {
	await obsidian.command(`${PLUGIN_ID}:${id}`);
}

/** Opens the modal palette and types the given input, leaving it focused. */
export async function openPaletteWith(obsidian: ObsidianAPI, input: string): Promise<Page> {
	await runPaletteCommand(obsidian, "open");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill(input);
	return page;
}

/** Writes a file through the adapter, so folders hidden by Excluded files can be created too. */
export async function writeRaw(page: Page, vaultPath: string, content: string): Promise<void> {
	await page.evaluate(
		async ({ vaultPath, content }) => {
			const adapter = (window as any).app.vault.adapter;
			const folder = vaultPath.split("/").slice(0, -1).join("/");
			if (folder && !(await adapter.exists(folder))) await adapter.mkdir(folder);
			await adapter.write(vaultPath, content);
		},
		{ vaultPath, content },
	);
}

/** Creates a note, and any missing parent folders, through the vault API. */
export async function createNote(page: Page, vaultPath: string, content = ""): Promise<void> {
	await page.evaluate(
		async ({ vaultPath, content }) => {
			const { vault } = (window as any).app;
			const folder = vaultPath.split("/").slice(0, -1).join("/");
			if (folder && !vault.getAbstractFileByPath(folder)) await vault.createFolder(folder);
			await vault.create(vaultPath, content);
		},
		{ vaultPath, content },
	);
}

/** Sets Obsidian's "Excluded files" filters, which the ignored-note index reads. */
export async function setIgnoreFilters(page: Page, filters: string[]): Promise<void> {
	await page.evaluate((filters) => {
		(window as any).app.vault.setConfig("userIgnoreFilters", filters);
	}, filters);
}

/** Reads the plugin instance, for settings that have no UI shortcut in the tests. */
export async function setPluginSettings(page: Page, patch: (settings: any) => void): Promise<void> {
	await page.evaluate(
		`(() => { const plugin = window.app.plugins.plugins["${PLUGIN_ID}"]; (${patch.toString()})(plugin.settings); })()`,
	);
}

export async function rowLabels(page: Page): Promise<string[]> {
	return page.locator(`${MODAL_ROW} .my-palette-suggestion__label`).allTextContents();
}

export async function activeFilePath(page: Page): Promise<string | null> {
	return page.evaluate(() => (window as any).app.workspace.getActiveFile()?.path ?? null);
}

/** Opens a vault file as the active note, like clicking it in the file explorer. */
export async function openNote(page: Page, vaultPath: string): Promise<void> {
	await page.evaluate(async (vaultPath) => {
		const app = (window as any).app;
		await app.workspace.getLeaf("tab").openFile(app.vault.getAbstractFileByPath(vaultPath));
	}, vaultPath);
}

export async function closePalette(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await page.locator(".my-palette-suggest-modal").waitFor({ state: "detached" });
}

export function menuItems(page: Page) {
	return page.locator(".menu .menu-item-title");
}
