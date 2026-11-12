import type { TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { BulkRenameModal } from "src/features/rename/BulkRenameModal";
import { SingleRenameModal } from "src/features/rename/SingleRenameModal";

/**
 * 名前の変更を開く。1つのファイルなら新しい名前を直接打つ入力欄、複数なら `検索/置換` で
 * まとめて変えるセレクターにする。`onDone` は名前を変えたあとに実行する。
 */
export function openRenameModal(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
	onDone?: () => void,
): void {
	if (files.length === 1) new SingleRenameModal(plugin.app, files[0], onDone).open();
	else new BulkRenameModal(plugin, files, onDone).open();
}
