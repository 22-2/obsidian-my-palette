import { TFile, type App } from "obsidian";
import type { PaletteResult } from "src/palette/results";

/**
 * Resolves a palette result to a file the vault indexes. Folders, Obsidian-excluded files,
 * Everything hits outside the vault and non-file rows (commands, plugins, ...) resolve to nothing.
 */
export function resolveVaultFile(app: App, result: PaletteResult): TFile | undefined {
	switch (result.mode) {
		case "file":
		case "everything": {
			if (!result.vaultPath) return undefined;
			const file = app.vault.getAbstractFileByPath(result.vaultPath);
			return file instanceof TFile ? file : undefined;
		}
		case "link":
		case "backlink":
		case "bookmark":
		case "smart":
			return result.file;
		case "audit":
			return "file" in result ? result.file : undefined;
		default:
			return undefined;
	}
}
