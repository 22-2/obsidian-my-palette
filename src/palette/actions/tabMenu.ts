import type { App, Menu, WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { ActionKind } from "src/palette/resultActions";
import { getCopyablePaths } from "src/palette/resultPresentation";
import type { PaletteResult, TabResult } from "src/palette/results";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { addTagInsertionMenuItems } from "src/tags/tagInsertionMenu";

export function isTabResult(result: PaletteResult): result is TabResult {
	return result.mode === "tab";
}

interface TabMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: Menu;
	/** Every targeted tab: the one clicked, or the whole selection for a bulk menu. */
	tabs: readonly TabResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	/** Re-runs the search so closed or duplicated tabs show up in the list. */
	onTabsChanged: () => void;
	onNoteActionSelected?: () => void;
}

const pluralTabs = (count: number): string => (count === 1 ? "tab" : `${count} tabs`);

/**
 * Tab-mode menu. Tabs are not files to open, so navigation items are replaced by
 * tab operations; copy and tag actions still apply to the notes the tabs show.
 */
export function populateTabMenu({
	app,
	plugin,
	menu,
	tabs,
	activate,
	onTabsChanged,
	onNoteActionSelected,
}: TabMenuOptions): void {
	const single = tabs.length === 1 ? tabs[0] : undefined;
	// Resolve leaves when the item is clicked: the tabs may have changed since the menu opened.
	const leavesNow = (): WorkspaceLeaf[] =>
		tabs.flatMap((tab) => plugin.tabProvider.leafOf(tab.id) ?? []);

	if (single) {
		menu.addItem((item) =>
			item
				.setTitle("Focus tab")
				.setIcon("arrow-right-to-line")
				.onClick(() => void activate("primary", single)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Duplicate tab")
				.setIcon("copy-plus")
				.onClick(() => {
					const [leaf] = leavesNow();
					if (!leaf) return;
					void app.workspace.duplicateLeaf(leaf).then(onTabsChanged);
				}),
		);
		menu.addSeparator();
	}

	const leaves = leavesNow();
	const allPinned = leaves.length > 0 && leaves.every((leaf) => leaf.getViewState().pinned);
	const nonePinned = leaves.every((leaf) => !leaf.getViewState().pinned);
	if (!allPinned) {
		menu.addItem((item) =>
			item
				.setTitle(`Pin ${pluralTabs(tabs.length)}`)
				.setIcon("pin")
				.onClick(() => {
					for (const leaf of leavesNow()) leaf.setPinned(true);
					onTabsChanged();
				}),
		);
	}
	if (!nonePinned) {
		menu.addItem((item) =>
			item
				.setTitle(`Unpin ${pluralTabs(tabs.length)}`)
				.setIcon("pin-off")
				.onClick(() => {
					for (const leaf of leavesNow()) leaf.setPinned(false);
					onTabsChanged();
				}),
		);
	}
	menu.addItem((item) =>
		item
			.setTitle(`Close ${pluralTabs(tabs.length)}`)
			.setIcon("x")
			.onClick(() => {
				for (const leaf of leavesNow()) leaf.detach();
				onTabsChanged();
			}),
	);

	const paths = tabs
		.map((tab) => getCopyablePaths(app, tab))
		.filter(({ fileName, relativePath, absolutePath }) =>
			Boolean(fileName || relativePath || absolutePath),
		);
	if (single) {
		addCopyPathMenuItems(menu, paths[0] ?? {}, (path) => void copyPathToClipboard(path));
	} else {
		addCopyPathListMenuItems(menu, paths, (values) => void copyPathListToClipboard(values));
	}
	addTagInsertionMenuItems(menu, plugin, tabs, onNoteActionSelected);
}
