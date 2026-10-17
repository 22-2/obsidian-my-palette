import type MyPalettePlugin from "src/main";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import { PaletteTableView } from "src/palette/surfaces/PaletteTableView";
import { PALETTE_VIEW_TYPE, PALETTE_TABLE_VIEW_TYPE } from "src/palette/surfaces/paletteViewTypes";

/**
 * Obsidian のイベントとビューの登録はここに置く。`onload` を、関係のない
 * ハンドラーの寄せ集めではなく、読みやすいライフサイクルの流れのままにするため。
 * Why: パスのコピーは My Palette のメニューに置き、Obsidian の標準のファイルメニューには
 * 追加しない。
 */
export function registerPluginEvents(plugin: MyPalettePlugin): void {
	plugin.registerView(PALETTE_VIEW_TYPE, (leaf) => new PaletteView(leaf, plugin));
	// Why: 型を分けると、各コマンドが自分のペインを再利用でき、Obsidian は
	// 一覧の検索と表の検索を同じワークスペース内で別々に復元できる。
	plugin.registerView(PALETTE_TABLE_VIEW_TYPE, (leaf) => new PaletteTableView(leaf, plugin));
}
