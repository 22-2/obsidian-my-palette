import type { App, TFile, WorkspaceLeaf } from "obsidian";

export type LeafOpenAction = "primary" | "alternate" | "vertical" | "horizontal";

export interface OpenFileOptions {
	action: LeafOpenAction;
	/** 主な開く操作が置き換える本文のリーフ。固定されているときは無視する。 */
	targetLeaf?: WorkspaceLeaf;
	/** 裏で開く操作は、リーフを有効にせずにファイルを読み込む。 */
	active: boolean;
	/** プレビューの操作はリーフを見せるが、キーボードのフォーカスはそのままにする。 */
	autoFocus: boolean;
	/** ファイルを既に表示しているタブを、別のタブを開く代わりに前面に出す。 */
	focusExisting: boolean;
}

/**
 * パレットの結果や関連ノートの操作から、Vault のファイルを開く唯一の経路。ファイルを開くすべての操作は
 * ここを通るので、タブの再利用は一度だけ決まる。
 */
export async function openFileInLeaf(
	app: App,
	file: TFile,
	options: OpenFileOptions,
): Promise<WorkspaceLeaf> {
	const existing = options.focusExisting ? findLeafShowingFile(app, file) : undefined;
	if (existing) {
		// Why: 裏で開く操作は、ノートがどこかに既に見えているときにユーザーのタブを切り替えてはいけない。
		// そのため、有効な操作だけが既存のリーフを前面に出す。
		if (options.active) await revealOpenedLeaf(app, existing, options.autoFocus);
		return existing;
	}
	const leaf = getLeafForAction(app, options.action, options.targetLeaf);
	await leaf.openFile(file, { active: options.active });
	if (options.active) await revealOpenedLeaf(app, leaf, options.autoFocus);
	return leaf;
}

/** 現在 `file` を表示しているビューを持つ最初のリーフを探す。 */
export function findLeafShowingFile(app: App, file: TFile): WorkspaceLeaf | undefined {
	let found: WorkspaceLeaf | undefined;
	app.workspace.iterateAllLeaves((leaf) => {
		if (!found && (leaf.view as { file?: TFile | null }).file?.path === file.path) found = leaf;
	});
	return found;
}

/**
 * 開く操作が書き込んでよいリーフを決める。
 *
 * 固定されたリーフは、ユーザーが保護しているワークスペースの面である。`getLeaf(false)` に任せると、
 * Obsidian が移動できる既存のリーフを選ぶか、新しく作るので、呼び出し元は固定リーフの規則を
 * 重複して書かなくてよい。
 */
export function getLeafForAction(
	app: App,
	action: LeafOpenAction,
	targetLeaf?: WorkspaceLeaf,
): WorkspaceLeaf {
	if (action === "primary" && targetLeaf && !isPinnedLeaf(targetLeaf)) return targetLeaf;
	return action === "alternate"
		? app.workspace.getLeaf("tab")
		: action === "horizontal"
			? app.workspace.getLeaf("split", "horizontal")
			: action === "vertical"
				? app.workspace.getLeaf("split", "vertical")
				: app.workspace.getLeaf(false);
}

export function isPinnedLeaf(leaf: WorkspaceLeaf): boolean {
	return leaf.getViewState().pinned === true;
}

/** 完全に読み込まれたビューにフォーカスする前に、実際の移動先を見せる。 */
export async function revealOpenedLeaf(
	app: App,
	leaf: WorkspaceLeaf,
	autoFocus = true,
): Promise<void> {
	// 遅延されたタブは、エディターのフォーカスを受け取る前に読み込みを終える必要がある。
	// プレビューの操作もノートを見せるが、キーボードのフォーカスはパレットに残す。
	await app.workspace.revealLeaf(leaf);
	if (autoFocus) app.workspace.setActiveLeaf(leaf, { focus: true });
}
