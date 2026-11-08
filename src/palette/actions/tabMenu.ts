import type { App, WorkspaceLeaf } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type MyPalettePlugin from "src/main";
import type { ActionKind } from "src/palette/resultActions";
import { addSelectionHeader } from "src/palette/actions/selectionHeader";
import { getCopyablePaths } from "src/palette/resultPresentation";
import type { PaletteResult, TabResult } from "src/palette/results";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { addTagInsertionMenuItems } from "src/tags/tagInsertionMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

export function isTabResult(result: PaletteResult): result is TabResult {
	return result.mode === "tab";
}

interface TabMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: PaletteMenu;
	/** 対象のタブすべて。クリックされた1つ、または一括メニューの場合は選択全体。 */
	tabs: readonly TabResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	/** 検索をやり直し、閉じたタブや複製したタブを一覧に出す。 */
	onTabsChanged: () => void;
	onNoteActionDone?: () => void;
}

/**
 * タブモードのメニュー。タブは開くファイルではないので、移動の項目はタブの操作に置き換える。
 * コピーとタグの操作は、タブが表示するノートに対して引き続き働く。
 */
export function populateTabMenu({
	app,
	plugin,
	menu,
	tabs,
	activate,
	onTabsChanged,
	onNoteActionDone,
}: TabMenuOptions): void {
	const single = tabs.length === 1 ? tabs[0] : undefined;
	// メニューを開いた後にタブが変わっているかもしれないので、リーフは項目をクリックしたときに解決する。
	const leavesNow = (): WorkspaceLeaf[] =>
		tabs.flatMap((tab) => plugin.tabProvider.leafOf(tab.id) ?? []);

	addSelectionHeader(menu, tabs.length);
	if (single) {
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.focusTab).onClick(() => void activate("primary", single)),
		);
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.duplicateTab).onClick(() => {
				const [leaf] = leavesNow();
				if (!leaf) return;
				void app.workspace.duplicateLeaf(leaf, "tab").then(onTabsChanged);
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
				.setTitle(t("tab.menu.pin"))
				.setIcon(ICONS.pin)
				.setSearchTerms("pin-tab")
				.onClick(() => {
					for (const leaf of leavesNow()) leaf.setPinned(true);
					onTabsChanged();
				}),
		);
	}
	if (!nonePinned) {
		menu.addItem((item) =>
			item
				.setTitle(t("tab.menu.unpin"))
				.setIcon(ICONS.unpin)
				.setSearchTerms("unpin-tab")
				.onClick(() => {
					for (const leaf of leavesNow()) leaf.setPinned(false);
					onTabsChanged();
				}),
		);
	}
	menu.addItem((item) =>
		item
			.setTitle(t("tab.menu.close"))
			.setIcon(ICONS.close)
			.setSearchTerms("close-tab")
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
	addTagInsertionMenuItems(menu, plugin, tabs, onNoteActionDone);
}
