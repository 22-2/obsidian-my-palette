import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { ObsidianAPI, VaultOptions } from "obsidian-e2e-toolkit";

export const PLUGIN_ID = "my-palette";

/** Installs the built plugin (see prepare-plugin.mjs), optionally with initial data.json. */
export function pluginVaultOptions(data?: Record<string, unknown>): Partial<VaultOptions> {
	return { plugins: [{ path: path.resolve(".e2e/plugin"), data }] };
}

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

export async function closePalette(page: Page): Promise<void> {
	await page.keyboard.press("Escape");
	await page.locator(".my-palette-suggest-modal").waitFor({ state: "detached" });
}

export function rowLabels(page: Page): Promise<string[]> {
	return page.locator(`${MODAL_ROW} .my-palette-suggestion__label`).allTextContents();
}

export function menuItems(page: Page): Locator {
	return page.locator(".menu .menu-item-title");
}

/** Writes a file through the adapter, so folders hidden by Excluded files can be created too. */
export async function writeRaw(obsidian: ObsidianAPI, vaultPath: string, content: string) {
	await obsidian.evaluateApp(
		async ({ vaultPath, content }) => {
			const { adapter } = app.vault;
			const folder = vaultPath.split("/").slice(0, -1).join("/");
			if (folder && !(await adapter.exists(folder))) await adapter.mkdir(folder);
			await adapter.write(vaultPath, content);
		},
		{ vaultPath, content },
	);
}

/** Sets Obsidian's "Excluded files" filters, which the ignored-note index reads. */
export async function setIgnoreFilters(obsidian: ObsidianAPI, filters: string[]) {
	await obsidian.evaluateApp((filters) => {
		(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
			"userIgnoreFilters",
			filters,
		);
	}, filters);
}
