import { TFile, type App } from "obsidian";
import type { PaletteResult } from "src/palette/results";

/**
 * 結果を、Vault がインデックスしているファイルに解決する。フォルダー、Obsidian の除外ファイル、
 * Vault の外の Everything の結果、ファイル以外の行(コマンド、プラグインなど)は、どれにも解決しない。
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
		case "heading":
		case "bookmark":
		case "smart":
			return result.file;
		case "audit":
			return "file" in result ? result.file : undefined;
		default:
			return undefined;
	}
}

/** 検索結果を対象ファイルへ解決し、同じパスの結果をまとめる。対象条件は操作ごとに指定する。 */
export function collectVaultFiles(
	app: App,
	results: readonly PaletteResult[],
	options: {
		acceptResult?: (result: PaletteResult) => boolean;
		acceptFile?: (file: TFile) => boolean;
	} = {},
): TFile[] {
	const files = new Map<string, TFile>();
	for (const result of results) {
		if (options.acceptResult && !options.acceptResult(result)) continue;
		const file = resolveVaultFile(app, result);
		if (file && (!options.acceptFile || options.acceptFile(file))) files.set(file.path, file);
	}
	return [...files.values()];
}
