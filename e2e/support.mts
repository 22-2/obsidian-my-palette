import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import type { ObsidianAPI, VaultOptions } from "obsidian-e2e-toolkit";

export const PLUGIN_ID = "my-palette";

// Resolved from this file, so the path does not depend on the directory the tests start in.
const PREPARED_PLUGIN_DIR = fileURLToPath(new URL("../.e2e/plugin", import.meta.url));

/** Installs the built plugin (see prepare-plugin.mjs), optionally with initial data.json. */
export function pluginVaultOptions(data?: Record<string, unknown>): Partial<VaultOptions> {
	return { plugins: [{ path: PREPARED_PLUGIN_DIR, data }] };
}

export const MODAL_INPUT = ".my-palette-suggest-modal .prompt-input";
export const MODAL_ROW = ".my-palette-suggest-modal .suggestion-item";

/** The Obsidian-excluded switch in the palette footer. */
export const IGNORED_TOGGLE = '.my-palette-status-toggle[data-status-toggle="include-ignored"]';

/** Runs one of the plugin's registered commands through Obsidian's command registry. */
export async function runPaletteCommand(obsidian: ObsidianAPI, id: string): Promise<void> {
	await obsidian.command(`${PLUGIN_ID}:${id}`);
}

/** Opens the modal palette and types the given input, leaving it focused. */
export async function openPaletteWith(obsidian: ObsidianAPI, input: string): Promise<Page> {
	await runPaletteCommand(obsidian, "open-note-list");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill(input);
	return page;
}

/** Opens Home, where aliases can select a search mode. */
export async function openHomeWith(obsidian: ObsidianAPI, input: string): Promise<Page> {
	await runPaletteCommand(obsidian, "open-home");
	const page = obsidian.page;
	await page.locator(MODAL_INPUT).waitFor();
	await page.locator(MODAL_INPUT).fill(input);
	return page;
}

export async function closePalette(page: Page): Promise<void> {
	// Escape returns to Home and changes the remembered query. Dismiss outside
	// the modal instead, so restore tests retain the search they just performed.
	const container = page.locator(".modal-container").filter({
		has: page.locator(".my-palette-suggest-modal"),
	});
	await container.locator(".modal-bg").click({ position: { x: 5, y: 5 } });
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

/** Sets Obsidian's "Excluded files" filters, which the Obsidian-excluded index reads. */
export async function setIgnoreFilters(obsidian: ObsidianAPI, filters: string[]) {
	await obsidian.evaluateApp((filters) => {
		(app.vault as unknown as { setConfig(key: string, value: unknown): void }).setConfig(
			"userIgnoreFilters",
			filters,
		);
	}, filters);
}
