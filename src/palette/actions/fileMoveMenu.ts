import { TFile, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import { isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import { MoveFileModal, type MoveSource } from "src/palette/MoveFileModal";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * 結果を、移動できるものに解決する。インデックスされたファイルは直接移動する。
 * Obsidian の除外ファイルの Markdown ノート(Everything からも到達する)は、移動先を選んだときに取り込む。
 * Obsidian が追跡しているファイルしか名前を変えられないためである。
 * フォルダーと Vault の外のパスは、どれにも解決しない。
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

/**
 * 選んだファイルすべてを、次に選ぶフォルダーへ移す操作を1つ加える。`onDone` はファイルを移動したあとに
 * 実行する。セレクターをキャンセルしたら、パレットは元の場所に残る。
 */
export function addFileMoveMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onDone?: () => void,
): void {
	const targets = new Map<string, MoveSource>();
	for (const result of results) {
		const source = resolveMoveSource(plugin.app, result);
		if (source)
			targets.set(source instanceof TFile ? source.path : source.excludedPath, source);
	}
	if (targets.size === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.moveToFolder).onClick(() =>
			new MoveFileModal(plugin, [...targets.values()], onDone).open(),
		),
	);
}
