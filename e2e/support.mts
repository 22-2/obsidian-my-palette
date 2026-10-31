import { fileURLToPath } from "node:url";
import type { Locator, Page } from "@playwright/test";
import { expect, type ObsidianAPI, type VaultOptions } from "obsidian-e2e-toolkit";

export const PLUGIN_ID = "my-palette";

export { t } from "../src/i18n";

// Resolved from this file, so the path does not depend on the directory the tests start in.
const PREPARED_PLUGIN_DIR = fileURLToPath(new URL("../.e2e/plugin", import.meta.url));

/**
 * Waits until the metadata cache has resolved each source note's links to the given targets.
 * Link and backlink modes read the resolved links, which fill in a moment after a note is created,
 * and later still while other workers keep the machine busy.
 */
export async function waitForResolvedLinks(
	obsidian: ObsidianAPI,
	links: Record<string, string[]>,
): Promise<void> {
	await expect
		.poll(() =>
			obsidian.evaluateApp(
				(links) =>
					Object.entries(links).every(([source, targets]) =>
						targets.every(
							(target) => app.metadataCache.resolvedLinks[source]?.[target],
						),
					),
				links,
			),
		)
		.toBe(true);
}

/** Installs the built plugin (see prepare-plugin.mjs), optionally with initial data.json. */
export function pluginVaultOptions(data?: Record<string, unknown>): Partial<VaultOptions> {
	return { plugins: [{ path: PREPARED_PLUGIN_DIR, data }] };
}

export const MODAL_INPUT = ".my-palette-suggest-modal .prompt-input";
export const MODAL_ROW = ".my-palette-suggest-modal .suggestion-item";

const OPTIONS_BUTTON = ".my-palette-suggest-modal .my-palette-options-button";
const MENU_ITEM = ".menu .menu-item";

/** The palette's option switches, such as Obsidian-excluded, live in the options menu. */
export const IGNORED_OPTION = "Obsidian の除外ファイルを表示";

/** Opens the options menu, runs `inspect`, and closes the menu again. */
async function inOptionsMenu<T>(page: Page, inspect: () => Promise<T>): Promise<T> {
	await page.locator(OPTIONS_BUTTON).click();
	await page.locator(".menu").waitFor();
	try {
		return await inspect();
	} finally {
		await page.keyboard.press("Escape");
		await page.locator(".menu").waitFor({ state: "detached" });
	}
}

/** Flips an option switch through the options menu, which stays open after the click. */
export async function flipOption(page: Page, label: string): Promise<void> {
	await inOptionsMenu(page, () =>
		page.locator(MENU_ITEM).filter({ hasText: label }).first().click(),
	);
}

/** The option's state in the options menu: "hidden" when the screen does not offer it. */
export async function optionState(page: Page, label: string): Promise<"on" | "off" | "hidden"> {
	return inOptionsMenu(page, async () => {
		const item = page.locator(MENU_ITEM).filter({ hasText: label });
		if ((await item.count()) === 0) return "hidden";
		return (await item.first().getAttribute("aria-checked")) === "true" ? "on" : "off";
	});
}

/** The titles of the options menu's items, in order. */
export async function optionMenuTitles(page: Page): Promise<string[]> {
	return inOptionsMenu(page, () =>
		page.locator(`${MENU_ITEM} .menu-item-title`).allTextContents(),
	);
}

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
