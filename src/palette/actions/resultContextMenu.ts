import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type MyPalettePlugin from "src/main";
import type { MocInsertionContext } from "src/moc-relateds/mocInsertion";
import { addMocInsertionMenuItem, addMocInsertionMenuItems } from "src/moc-relateds/mocInsertion";
import { isAuditResult, populateAuditMenu } from "src/palette/actions/auditMenu";
import { addBookmarkMenuItems } from "src/palette/actions/bookmarkMenu";
import { addBulkRenameMenuItem } from "src/palette/actions/bulkRenameMenu";
import { addNoteDeleteMenuItem } from "src/palette/actions/noteDeleteMenu";
import { addPropertyEditMenuItem } from "src/palette/actions/propertyEditMenu";
import { addSelectionHeader } from "src/palette/actions/selectionHeader";
import { addFileMoveMenuItem } from "src/palette/actions/fileMoveMenu";
import { addMergeMenuItem } from "src/palette/actions/mergeMenu";
import { isTabResult, populateTabMenu } from "src/palette/actions/tabMenu";
import type { ActionKind } from "src/palette/resultActions";
import { getCopyablePaths, isCopyablePaletteResult } from "src/palette/resultPresentation";
import type { PaletteResult } from "src/palette/results";
import {
	getResultAbsolutePath,
	isDesktopApp,
	isFolderResult,
	openInExternalEditor,
	showInSystemExplorer,
} from "src/platform/externalOpen";
import { getTerminalDirectory, openDirectoryInTerminal } from "src/platform/terminal";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { addTagInsertionMenuItems } from "src/tags/tagInsertionMenu";
import { populateTagMenu } from "src/tags/tagMenu";
import { populatePropertyMenu } from "src/properties/propertyMenu";
import { openPluginSettings } from "src/search/plugin/pluginSettings";
import {
	addExternalAppMenuItems,
	addMenuAction,
	addOpenMenuItems,
	MENU_ACTIONS,
} from "src/ui/menuActions";

interface PaletteResultMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: PaletteMenu;
	result: PaletteResult;
	selectedItems: PaletteResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	openInBackground: (result: PaletteResult) => void | Promise<void>;
	openInMainWindow?: (result: PaletteResult) => void | Promise<void>;
	applySearchHistory: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
	/** 独自のモーダルを開く、またはノートを編集する操作の前に、モーダルのパレットを閉じられるようにする。 */
	onNoteActionSelected?: () => void;
	/**
	 * 独自のセレクター(タグ、移動、名前の変更)を開く操作が終わったら、モーダルのパレットを閉じる。
	 * パレットは下で開いたままになるので、キャンセルすると元に戻る。
	 */
	onNoteActionDone?: () => void;
	getMocContext?: () => MocInsertionContext;
	/** タブまたはブックマークの操作で一覧の結果が変わったあと、検索をやり直す。 */
	onResultsChanged?: () => void;
}

/** モーダルと常駐のパレットの両方が使う、結果のメニューを組み立てる。 */
export function populatePaletteResultMenu({
	app,
	plugin,
	menu,
	result,
	selectedItems,
	activate,
	openInBackground,
	openInMainWindow,
	applySearchHistory,
	onNoteActionSelected,
	onNoteActionDone,
	getMocContext,
	onResultsChanged,
}: PaletteResultMenuOptions): void {
	// Why: 開いているメニューで入力すると、そうしないとパレットの検索欄に入ってしまうため。
	menu.enableFilter(app);
	// タブの結果は独自のメニューを持つ。1回の検索は1つのモードの結果しか作らないので、
	// 種類の混ざった選択は起こらない。
	const targets = selectedItems.length > 1 ? selectedItems : [result];
	if (targets.every(isTabResult)) {
		populateTabMenu({
			app,
			plugin,
			menu,
			tabs: targets,
			activate,
			onTabsChanged: onResultsChanged ?? (() => {}),
			onNoteActionDone,
		});
		return;
	}
	if (targets.every(isAuditResult)) {
		populateAuditMenu({
			app,
			plugin,
			menu,
			results: targets,
			activate,
			onNoteActionSelected,
			onResultsChanged,
		});
		return;
	}
	if (targets.every((item) => item.mode === "tag")) {
		populateTagMenu({
			app,
			plugin,
			menu,
			tags: targets,
			activate,
			onNoteActionDone,
		});
		return;
	}
	const selectedPaths = selectedItems
		.filter(isCopyablePaletteResult)
		.map((item) => getCopyablePaths(app, item))
		.filter(({ fileName, relativePath, absolutePath }) =>
			Boolean(fileName || relativePath || absolutePath),
		);
	if (selectedPaths.length > 1) {
		// Why: 複数選択には移動の操作に使える結果が1つもないので、
		// 選んだすべてのパスやノートに働く操作を出す。
		addSelectionHeader(menu, selectedItems.length);
		addCopyPathListMenuItems(
			menu,
			selectedPaths,
			(values) => void copyPathListToClipboard(values),
		);
		addFileMoveMenuItem(menu, plugin, selectedItems, onNoteActionDone);
		addBulkRenameMenuItem(menu, plugin, selectedItems, onNoteActionDone);
		addPropertyEditMenuItem(menu, plugin, selectedItems, onNoteActionSelected);
		addMocInsertionMenuItems(menu, plugin, selectedItems, onNoteActionSelected, getMocContext);
		addTagInsertionMenuItems(menu, plugin, selectedItems, onNoteActionDone);
		addNoteDeleteMenuItem(app, menu, selectedItems, onResultsChanged);
		// Why: 統合は統合元をゴミ箱に移すので、ほかの書き換えの後ろに置く。
		addMergeMenuItem(menu, plugin, selectedItems, onNoteActionDone);
		addBookmarkMenuItems({
			menu,
			plugin,
			results: selectedItems,
			onBookmarksChanged: onResultsChanged,
			onNoteActionDone,
		});
		return;
	}

	if (result.mode === "search-history") {
		addMenuAction(menu, MENU_ACTIONS.useSearch, () => applySearchHistory(result));
		return;
	}
	if (result.mode === "mode-entry") {
		addMenuAction(menu, MENU_ACTIONS.enterMode, () => void activate("primary", result));
		return;
	}
	if (result.mode === "property") {
		populatePropertyMenu(
			menu,
			plugin,
			result,
			() => void activate("primary", result),
			onNoteActionSelected,
		);
		return;
	}
	if (result.mode === "command") {
		addMenuAction(menu, MENU_ACTIONS.runCommand, () => void activate("primary", result));
		return;
	}

	/** ターミナルを開き、失敗を報告する。パレットは閉じない。 */
	const openTerminal = (absolutePath: string, isFolder: boolean): void => {
		onNoteActionSelected?.();
		void openDirectoryInTerminal(getTerminalDirectory(absolutePath, isFolder)).then((error) => {
			if (error) new Notice(error);
		});
	};

	if (result.mode === "plugin" || result.mode === "snippet") {
		// Why: プラグインのフォルダーとスニペットのファイルには Obsidian のビューがないので、リーフの
		// 移動とノートの操作(MOC、タグ)を飛ばし、外部で開く操作だけを出す。
		// プラグインは、設定タブがあればそれも出す。
		const externalPath = isDesktopApp() ? getResultAbsolutePath(app, result) : undefined;
		const externalFolder = isFolderResult(result);
		addExternalAppMenuItems(menu, {
			openInExternalEditor: () => void activate("primary", result),
			...(externalPath
				? {
						showInSystemExplorer: () => {
							onNoteActionSelected?.();
							showInSystemExplorer(externalPath, externalFolder);
						},
						openInTerminal: () => openTerminal(externalPath, externalFolder),
					}
				: {}),
		});
		if (result.mode === "plugin" && result.hasSettings) {
			const pluginId = result.pluginId;
			addMenuAction(menu, MENU_ACTIONS.openPluginSettings, () => {
				onNoteActionSelected?.();
				openPluginSettings(app, pluginId);
			});
		}
		addCopyPathMenuItems(
			menu,
			getCopyablePaths(app, result),
			(path) => void copyPathToClipboard(path),
		);
		return;
	}

	const paths = getCopyablePaths(app, result);
	addOpenMenuItems(menu, {
		open: () => void activate("primary", result),
		// Why: この操作を出すのはポップアウトのホストだけ。通常のパレットはすでにメインウィンドウで開いており、
		// 余分な移動のコマンドを出すべきではない。
		...(openInMainWindow ? { openInMainWindow: () => void openInMainWindow(result) } : {}),
		openInBackground: () => void openInBackground(result),
		openSideBySide: () => void activate("vertical", result),
		openBelow: () => void activate("horizontal", result),
	});
	const absolutePath = isDesktopApp() ? getResultAbsolutePath(app, result) : undefined;
	if (absolutePath) {
		// Why: 外部アプリの操作は、Everything だけでなくすべてのファイルの結果に働く。
		// 「システムのエクスプローラーで表示」は、以前の Everything だけの「ファイルエクスプローラーで表示」を統一したもの。
		// これは Obsidian のファイルエクスプローラーと混同されていた。
		const isFolder = isFolderResult(result);
		menu.addSeparator();
		addExternalAppMenuItems(menu, {
			openInExternalEditor: () => {
				onNoteActionSelected?.();
				void openInExternalEditor(absolutePath);
			},
			showInSystemExplorer: () => {
				onNoteActionSelected?.();
				showInSystemExplorer(absolutePath, isFolder);
			},
			openInTerminal: () => openTerminal(absolutePath, isFolder),
		});
	}
	addCopyPathMenuItems(menu, paths, (path) => void copyPathToClipboard(path));
	addFileMoveMenuItem(menu, plugin, [result], onNoteActionDone);
	addBulkRenameMenuItem(menu, plugin, [result], onNoteActionDone);
	addPropertyEditMenuItem(menu, plugin, [result], onNoteActionSelected);
	// Why: MOC への挿入は複数のノートを書き換えるので、移動やコピーなど書き換えない操作の後に置く。
	// 両方のパレットの外枠で、そうなるようにする。
	addMocInsertionMenuItem(menu, plugin, result, onNoteActionSelected, getMocContext);
	addTagInsertionMenuItems(menu, plugin, [result], onNoteActionDone);
	addNoteDeleteMenuItem(app, menu, [result], onResultsChanged);
	addMergeMenuItem(menu, plugin, [result], onNoteActionDone);
	// Why: 検索のブックマークの選択にはパスがないので、この1結果のメニューに届く。
	// ブックマークの操作は、選んだすべてのブックマークに引き続き働く。
	addBookmarkMenuItems({
		menu,
		plugin,
		results: targets,
		onBookmarksChanged: onResultsChanged,
		onNoteActionDone,
	});
}
