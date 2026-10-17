import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import type { TabResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

/** メインのエディター領域のタブ。ポップアウトのウィンドウ内のものも含む。サイドバーは除く。 */
function getMainAreaLeaves(app: App): WorkspaceLeaf[] {
	const { workspace } = app;
	const leaves: WorkspaceLeaf[] = [];
	workspace.iterateAllLeaves((leaf) => {
		const root = leaf.getRoot();
		if (root !== workspace.leftSplit && root !== workspace.rightSplit) leaves.push(leaf);
	});
	return leaves;
}

/**
 * 開いているメイン領域のタブを一覧にし、パレットがファイルを開く代わりにタブへ切り替えられるようにする。
 * 結果はタブの ID だけを持つ。WorkspaceLeaf を結果の型に埋め込むと、表の行の型が Obsidian の
 * ワークスペース全体のモデルを再帰的にたどってしまうため。
 */
export class TabProvider implements PaletteProvider<TabResult> {
	private leaves = new Map<string, WorkspaceLeaf>();

	constructor(private readonly app: App) {}

	/** 最新の検索の結果の背後にあるリーフ。タブがまだ開いていれば。 */
	leafOf(tabId: string): WorkspaceLeaf | undefined {
		const leaf = this.leaves.get(tabId);
		return leaf && getMainAreaLeaves(this.app).includes(leaf) ? leaf : undefined;
	}

	async search({ query }: PaletteSearchRequest): Promise<TabResult[]> {
		this.leaves = new Map();
		const results = getMainAreaLeaves(this.app).map((leaf, index): TabResult => {
			const tabId = `tab:${index}`;
			this.leaves.set(tabId, leaf);
			const viewFile = (leaf.view as { file?: unknown }).file;
			const file = viewFile instanceof TFile ? viewFile : undefined;
			return {
				id: tabId,
				mode: "tab",
				primary: leaf.getDisplayText(),
				secondary: file?.path ?? "",
				icon: leaf.getIcon(),
				file,
			};
		});
		if (!query.trim()) return results;
		return searchFuzzyQuery(query, results, [
			(result) => result.primary,
			(result) => result.secondary,
		]).map(({ obj }) => obj);
	}
}
