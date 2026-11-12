import type MyPalettePlugin from "src/main";
import { collectVaultFiles } from "src/features/palette/actions/resultFile";
import type { PaletteResult } from "src/core/results";
import { openRenameModal } from "src/features/rename/openRename";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * 選んだファイルの名前を変える操作を1つ加える(1つなら直接打つ入力欄、複数なら名前変更セレクター)。`onDone` は
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
	const targets = collectVaultFiles(plugin.app, results);
	if (targets.length === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.rename).onClick(() =>
			openRenameModal(plugin, targets, onDone),
		),
	);
}
