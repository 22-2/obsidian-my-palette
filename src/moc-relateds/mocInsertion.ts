import { Notice, TFile, type Menu, type WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import {
	insertFileToActiveMocRelateds,
	insertFileToMocRelateds,
} from "src/moc-relateds/mocRelateds";
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

export interface MocInsertionContext {
	mocFile: TFile | null;
	mocLeaf?: WorkspaceLeaf;
}

/** Adds the same MOC insertion action to both the modal and persistent palette menus. */
export function addMocInsertionMenuItem(
	menu: Menu,
	plugin: MyPalettePlugin,
	result: PaletteResult,
	onSelected?: () => void,
	getContext?: () => MocInsertionContext,
): void {
	addMocInsertionMenuItems(menu, plugin, [result], onSelected, getContext);
}

/** Adds one action for eligible notes so a multi-selection shares one MOC destination. */
export function addMocInsertionMenuItems(
	menu: Menu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
	getContext?: () => MocInsertionContext,
): void {
	const insertableResults = results.filter((result) => {
		if (result.mode === "command" || result.mode === "search-history") return false;
		if (result.mode === "everything" && (result.kind === "folder" || !result.vaultPath))
			return false;
		return !(result.mode === "bookmark" && result.kind === "search");
	});
	if (!insertableResults.length) return;
	menu.addSeparator();
	menu.addItem((item) =>
		item
			.setTitle(
				results.length > 1
					? "Insert selected into MOC Relateds"
					: "Insert into MOC Relateds",
			)
			.setIcon("list-plus")
			.onClick(() => {
				onSelected?.();
				void (async () => {
					const targets = new Map<string, TFile>();
					let unavailableCount = 0;
					for (const result of insertableResults) {
						const target = await resolveMocTarget(plugin, result);
						if (target) targets.set(target.path, target);
						else unavailableCount++;
					}
					if (unavailableCount === 1 && insertableResults.length === 1)
						new Notice("This result is not an available vault note.");
					else if (unavailableCount > 0)
						new Notice(
							`${unavailableCount} selected results are not available vault notes.`,
						);
					if (!targets.size) return;
					const context = getContext?.();
					// Why: each insertion reads and updates the shared MOC, so process targets
					// serially to keep one selection from overwriting another's changes.
					for (const target of targets.values()) {
						if (context)
							await insertFileToMocRelateds(
								plugin,
								context.mocFile,
								target,
								context.mocLeaf,
							);
						else await insertFileToActiveMocRelateds(plugin, target);
					}
				})();
			}),
	);
}
