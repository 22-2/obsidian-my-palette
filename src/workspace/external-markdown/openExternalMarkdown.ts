import type { App, WorkspaceLeaf } from "obsidian";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import { getLeafForAction, revealOpenedLeaf, type LeafOpenAction } from "src/workspace/openLeaf";
import type MyPalettePlugin from "src/main";

const MARKDOWN_VIEW_TYPE = "markdown";
const EXTERNAL_FILE_PREFIX = "file:";

/** ネイティブの Markdown ビューは、file の URI を介して Vault の外のファイルを表せる。 */
export function isExternalMarkdownLeaf(leaf: WorkspaceLeaf): boolean {
	if (leaf.view.getViewType() !== MARKDOWN_VIEW_TYPE) return false;
	const file = leaf.view.getState().file;
	return typeof file === "string" && file.toLocaleLowerCase().startsWith(EXTERNAL_FILE_PREFIX);
}

export function getExternalMarkdownLeaves(app: App): WorkspaceLeaf[] {
	return app.workspace
		.getLeavesOfType(MARKDOWN_VIEW_TYPE)
		.filter((leaf) => isExternalMarkdownLeaf(leaf));
}

/**
 * 外部の Markdown リーフの再利用はワークスペースの関心事なので、プラグインのクラスの外に置く。
 * パレットの操作が使う公開メソッドは保つ。
 */
export async function openExternalMarkdown(
	plugin: MyPalettePlugin,
	absolutePath: string,
	action: LeafOpenAction,
	autoFocus = true,
	active = true,
	targetLeaf?: WorkspaceLeaf,
	reuseExisting = true,
): Promise<void> {
	const resolvedPath = getDesktopAdapter(plugin.app).path.resolve(absolutePath);
	const externalLeaves = getExternalMarkdownLeaves(plugin.app);
	const existing = externalLeaves.find(
		// Why: 明示的な移動先のウィンドウは、別のウィンドウにある一致する外部のノートで上書きしてはいけない
		// (例: メインウィンドウで開く)。
		(leaf) =>
			reuseExisting &&
			plugin.settings.focusExistingTab &&
			(!targetLeaf || leaf.getContainer() === targetLeaf.getContainer()) &&
			externalPathOf(leaf)?.toLocaleLowerCase() === resolvedPath.toLocaleLowerCase(),
	);
	if (existing) {
		// Why: 裏で開く操作は、既に見えているノートへユーザーのタブを切り替えてはいけない。
		if (!active) return;
		// Why: ネイティブの Markdown リーフがこの外部のパスを既に持っているので、開き直すときは
		// 重複するリーフを作らず、そのタブへ移動する。
		await existing.setViewState({
			type: MARKDOWN_VIEW_TYPE,
			active: true,
			state: markdownViewState(resolvedPath),
		});
		// 再利用した外部のノートも既存のタブへ移動する。新しく開いたノートと同じく、読み込みを待ち、
		// プレビューのフォーカスの指定に従う。
		await revealOpenedLeaf(plugin.app, existing, autoFocus);
		return;
	}
	const leaf: WorkspaceLeaf = getLeafForAction(plugin.app, action, targetLeaf);
	await leaf.setViewState({
		type: MARKDOWN_VIEW_TYPE,
		active,
		state: markdownViewState(resolvedPath),
	});
	if (active) await revealOpenedLeaf(plugin.app, leaf, autoFocus);
}

function markdownViewState(absolutePath: string): Record<string, unknown> {
	return {
		file: `${EXTERNAL_FILE_PREFIX}${absolutePath}`,
		mode: "source",
		source: false,
	};
}

function externalPathOf(leaf: WorkspaceLeaf): string | undefined {
	const file = leaf.view.getState().file;
	if (typeof file !== "string" || !file.toLocaleLowerCase().startsWith(EXTERNAL_FILE_PREFIX))
		return undefined;
	return file.slice(EXTERNAL_FILE_PREFIX.length);
}
