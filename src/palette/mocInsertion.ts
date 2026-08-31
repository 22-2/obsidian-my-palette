import { Notice, TFile, type Menu } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/model/results";
import { insertFileToActiveMocRelateds } from "src/commands/mocRelateds";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";

/** Resolves a palette result to a vault note for the shared MOC menu action. */
async function resolveMocTarget(
	plugin: MyPalettePlugin,
	result: PaletteResult,
): Promise<TFile | undefined> {
	if (result.mode === "file") {
		if (result.ignored) {
			try {
				return await materializeIgnoredNote(plugin.app, result.vaultPath);
			} catch (error) {
				new Notice(
					error instanceof Error ? error.message : "Failed to import ignored note.",
				);
				return undefined;
			}
		}
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		return file instanceof TFile ? file : undefined;
	}
	if (result.mode === "everything") {
		if (!result.vaultPath) return undefined;
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		return file instanceof TFile ? file : undefined;
	}
	if (result.mode === "command" || result.mode === "search-history") return undefined;
	return result.file;
}

/** Adds the same MOC insertion action to both the modal and persistent palette menus. */
export function addMocInsertionMenuItem(
	menu: Menu,
	plugin: MyPalettePlugin,
	result: PaletteResult,
	onSelected?: () => void,
): void {
	if (result.mode === "command" || result.mode === "search-history") return;
	if (result.mode === "everything" && (result.kind === "folder" || !result.vaultPath)) return;
	if (result.mode === "bookmark" && result.kind === "search") return;
	menu.addItem((item) =>
		item
			.setTitle("Insert into MOC Relateds")
			.setIcon("list-plus")
			.onClick(() => {
				onSelected?.();
				void (async () => {
					const target = await resolveMocTarget(plugin, result);
					if (!target) {
						new Notice("This result is not an available vault note.");
						return;
					}
					await insertFileToActiveMocRelateds(plugin, target);
				})();
			}),
	);
}
