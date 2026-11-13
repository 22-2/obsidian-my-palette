import type MyPalettePlugin from "src/main";
import { PaletteView } from "src/features/palette/surfaces/PaletteView";
import { registerGitProtocol } from "src/features/git/gitUi";
import { GitVersionView, GIT_VERSION_VIEW } from "src/features/git/GitVersionView";
import { GitDiffView } from "src/features/git/GitDiffView";
import { GIT_DIFF_VIEW } from "src/features/git/gitDiffOpening";
import { PaletteTableView } from "src/features/palette/surfaces/PaletteTableView";
import {
	PALETTE_VIEW_TYPE,
	PALETTE_TABLE_VIEW_TYPE,
} from "src/features/palette/surfaces/paletteViewTypes";

/**
 * Obsidian のイベントとビューの登録はここに置く。`onload` を、関係のない
 * ハンドラーの寄せ集めではなく、読みやすいライフサイクルの流れのままにするため。
 * Why: パスのコピーは My Palette のメニューに置き、Obsidian の標準のファイルメニューには
 * 追加しない。
 */
export function registerPluginEvents(plugin: MyPalettePlugin): void {
	registerGitProtocol(plugin);
	plugin.registerView(GIT_VERSION_VIEW, (leaf) => new GitVersionView(leaf));
	plugin.registerView(GIT_DIFF_VIEW, (leaf) => new GitDiffView(leaf));
	plugin.registerView(PALETTE_VIEW_TYPE, (leaf) => new PaletteView(leaf, plugin));
	// Why: 型を分けると、各コマンドが自分のペインを再利用でき、Obsidian は
	// 一覧の検索と表の検索を同じワークスペース内で別々に復元できる。
	plugin.registerView(PALETTE_TABLE_VIEW_TYPE, (leaf) => new PaletteTableView(leaf, plugin));
}
