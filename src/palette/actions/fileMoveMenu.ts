import { TFile, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import { isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import { MoveFileModal, type MoveSource } from "src/palette/MoveFileModal";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";

/**
 * Resolves a palette result to something movable. Indexed files move directly;
 * Obsidian-excluded Markdown notes (also reached through Everything) are imported
 * when the destination is chosen, because Obsidian can only rename files it tracks.
 * Folders and paths outside the vault resolve to nothing.
 */
function resolveMoveSource(app: App, result: PaletteResult): MoveSource | undefined {
	const file = resolveVaultFile(app, result);
	if (file) return file;
	if ((result.mode !== "file" && result.mode !== "everything") || !result.vaultPath)
		return undefined;
	const importable =
		isUserIgnoredPath(app, result.vaultPath) &&
		result.vaultPath.toLocaleLowerCase().endsWith(".md");
	return importable ? { excludedPath: result.vaultPath } : undefined;
}

/** Adds one action that moves every selected file into the folder chosen next. */
export function addFileMoveMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
): void {
	const targets = new Map<string, MoveSource>();
	for (const result of results) {
		const source = resolveMoveSource(plugin.app, result);
		if (source)
			targets.set(source instanceof TFile ? source.path : source.excludedPath, source);
	}
	if (targets.size === 0) return;
	menu.addItem((item) =>
		item
			.setTitle("Move to…")
			.setIcon("folder-input")
			.onClick(() => {
				onSelected?.();
				new MoveFileModal(plugin, [...targets.values()]).open();
			}),
	);
}
