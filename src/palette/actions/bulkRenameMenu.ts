import type MyPalettePlugin from "src/main";
import { collectVaultFiles } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/core/results";
import { BulkRenameModal } from "src/rename/BulkRenameModal";
import type { PaletteMenu } from "src/ui/paletteMenu";
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
	const targets = collectVaultFiles(plugin.app, results);
	if (targets.length === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.rename).onClick(() =>
			new BulkRenameModal(plugin, targets, onDone).open(),
		),
	);
}
