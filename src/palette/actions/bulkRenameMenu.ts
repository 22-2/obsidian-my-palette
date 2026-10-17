import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import { BulkRenameModal } from "src/rename/BulkRenameModal";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type { TFile } from "obsidian";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * 名前の変更セレクターで、選んだファイルの名前を変える操作を1つ加える。`onDone` は
 * ファイルの名前を変えたあとに実行する。キャンセルすると、パレットは元の場所に残る。
 * 対象になるのは、Vault がインデックスしているファイルだけ。フォルダー、Obsidian の除外ファイル、
 * 外部のファイルの名前は、決して変えない。
 */
export function addBulkRenameMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onDone?: () => void,
): void {
	const targets = new Map<string, TFile>();
	for (const result of results) {
		const file = resolveVaultFile(plugin.app, result);
		if (file) targets.set(file.path, file);
	}
	if (targets.size === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.rename).onClick(() =>
			new BulkRenameModal(plugin, [...targets.values()], onDone).open(),
		),
	);
}
