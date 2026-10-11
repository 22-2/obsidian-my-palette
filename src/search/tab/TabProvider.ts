import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import type { TabResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

/** Tabs in the main editor area, including those in pop-out windows; sidebars are excluded. */
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
 * Lists open main-area tabs so the palette can switch to one instead of opening a file.
 * Results carry only a tab id: embedding WorkspaceLeaf in the result type makes the
 * table's row typing recurse through Obsidian's whole workspace model.
 */
export class TabProvider implements PaletteProvider<TabResult> {
	private leaves = new Map<string, WorkspaceLeaf>();

	constructor(private readonly app: App) {}

	/** The leaf behind a result from the latest search, if the tab is still open. */
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
