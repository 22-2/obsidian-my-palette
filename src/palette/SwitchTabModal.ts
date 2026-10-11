import { Notice, type App, type WorkspaceLeaf } from "obsidian";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";

interface TabItem extends SelectionItem {
	leaf: WorkspaceLeaf;
}

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

function toTabItem(leaf: WorkspaceLeaf): TabItem {
	const path = (leaf.view as { file?: { path?: string } }).file?.path;
	return {
		label: leaf.getDisplayText(),
		description: path,
		icon: leaf.getIcon(),
		leaf,
	};
}

/** Lists every main-area tab; ArrowRight previews a tab and Enter keeps it. */
export class SwitchTabModal extends SelectionModal<TabItem> {
	constructor(app: App) {
		const items = getMainAreaLeaves(app).map(toTabItem);
		const originalLeaf = app.workspace.getMostRecentLeaf();
		super(
			{
				placeholder: "Search tabs by name or path",
				items,
				defaultValue: items.find((item) => item.leaf === originalLeaf),
			},
			app,
		);
	}

	async getSuggestions(query: string): Promise<TabItem[]> {
		const lowered = query.trim().toLowerCase();
		const results = lowered
			? this.items.filter(
					({ label, description }) =>
						label.toLowerCase().includes(lowered) ||
						(description ?? "").toLowerCase().includes(lowered),
				)
			: this.items;
		this.query = query;
		this.updateResultCount(results.length);
		return results;
	}

	protected override handlesSuggestionPreview(): boolean {
		return true;
	}

	protected override async onSuggestionPreview(item: TabItem): Promise<void> {
		this.app.workspace.setActiveLeaf(item.leaf, { focus: false });
	}

	protected override async onItemActivated(item: TabItem): Promise<void> {
		this.close();
		this.app.workspace.setActiveLeaf(item.leaf, { focus: true });
	}
}

export function openSwitchTabModal(app: App): void {
	if (getMainAreaLeaves(app).length === 0) {
		new Notice("No tabs to switch to.");
		return;
	}
	new SwitchTabModal(app).open();
}
