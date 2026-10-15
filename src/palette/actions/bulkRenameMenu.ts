import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import { BulkRenameModal } from "src/rename/BulkRenameModal";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type { TFile } from "obsidian";

/**
 * Adds one action that renames the selected files in the Rename selector. Only files the vault
 * indexes qualify: folders and Obsidian-excluded or external files are never renamed.
 */
export function addBulkRenameMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
): void {
	const targets = new Map<string, TFile>();
	for (const result of results) {
		const file = resolveVaultFile(plugin.app, result);
		if (file) targets.set(file.path, file);
	}
	if (targets.size === 0) return;
	menu.addItem((item) =>
		item
			.setTitle("Rename…")
			.setIcon("pencil-line")
			.onClick(() => {
				onSelected?.();
				new BulkRenameModal(plugin, [...targets.values()]).open();
			}),
	);
}
