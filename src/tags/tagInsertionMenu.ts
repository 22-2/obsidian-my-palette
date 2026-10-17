import { TFile, type App } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type { PaletteResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";
import type MyPalettePlugin from "src/main";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * パレットの結果を、インデックス済みの Markdown ノートに解決する。Obsidian の除外ファイルは
 * 取り込まずにスキップする。タグを付けるためだけにノートを保管庫のインデックスへ移すべきではないため。
 * MOC への挿入はリンク先が必要なので、この扱いとは異なる。
 */
function resolveTagTarget(app: App, result: PaletteResult): TFile | undefined {
	if (
		result.mode === "command" ||
		result.mode === "plugin" ||
		result.mode === "snippet" ||
		result.mode === "property" ||
		result.mode === "audit" ||
		result.mode === "search-history" ||
		result.mode === "mode-entry"
	)
		return undefined;
	if (result.mode === "file" && result.ignored) return undefined;
	const file =
		result.mode === "file" || result.mode === "everything"
			? result.vaultPath
				? app.vault.getAbstractFileByPath(result.vaultPath)
				: null
			: result.file;
	return file instanceof TFile && file.extension === "md" ? file : undefined;
}

/**
 * 選んだすべてのノートに、選んだタグを挿入するアクションを 1 つ追加する。`onDone` は
 * タグを適用した後にだけ実行する。セレクターをキャンセルしたときは、パレットの位置を保つ。
 */
export function addTagInsertionMenuItems(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onDone?: () => void,
): void {
	const targets = new Map<string, TFile>();
	for (const result of results) {
		const file = resolveTagTarget(plugin.app, result);
		if (file) targets.set(file.path, file);
	}
	if (targets.size === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.addTags).onClick(() => {
			void insertTags(plugin, [...targets.values()]).then((applied) => {
				if (applied) onDone?.();
			});
		}),
	);
}
