import type { App } from "obsidian";
import { Notice } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type MyPalettePlugin from "src/main";
import type { MocInsertionContext } from "src/moc-relateds/mocInsertion";
import { addMocInsertionMenuItem, addMocInsertionMenuItems } from "src/moc-relateds/mocInsertion";
import { isAuditResult, populateAuditMenu } from "src/palette/actions/auditMenu";
import { addBookmarkMenuItems } from "src/palette/actions/bookmarkMenu";
import { addBulkRenameMenuItem } from "src/palette/actions/bulkRenameMenu";
import { addPropertyEditMenuItem } from "src/palette/actions/propertyEditMenu";
import { addSelectionHeader } from "src/palette/actions/selectionHeader";
import { addFileMoveMenuItem } from "src/palette/actions/fileMoveMenu";
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
import { populatePropertyMenu } from "src/properties/propertyMenu";
import { openPluginSettings } from "src/search/plugin/pluginSettings";

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
	/** Lets a modal palette close before an action that opens its own modal or edits notes. */
	onNoteActionSelected?: () => void;
	/**
	 * Closes a modal palette once an action that opens its own selector (tags, move, rename)
	 * has finished. The palette stays open underneath, so cancelling returns to it.
	 */
	onNoteActionDone?: () => void;
	getMocContext?: () => MocInsertionContext;
	/** Re-runs the search after a tab or bookmark operation changed the listed results. */
	onResultsChanged?: () => void;
}

/** Populates the result menu shared by modal and persistent palette surfaces. */
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
	// Why: typing in an open menu would otherwise go to the palette's search input.
	menu.enableFilter(app);
	// Tab results get their own menu; a mixed selection cannot happen because
	// one search produces results of a single mode.
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
		populateAuditMenu({ app, menu, results: targets, activate });
		return;
	}
	const selectedPaths = selectedItems
		.filter(isCopyablePaletteResult)
		.map((item) => getCopyablePaths(app, item))
		.filter(({ fileName, relativePath, absolutePath }) =>
			Boolean(fileName || relativePath || absolutePath),
		);
	if (selectedPaths.length > 1) {
		// Why: a multi-selection has no single result for navigation actions, so expose
		// actions that can operate on all selected paths or notes.
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
		menu.addItem((item) =>
			item
				.setTitle("Use search")
				.setIcon("history")
				.onClick(() => applySearchHistory(result)),
		);
		return;
	}
	if (result.mode === "mode-entry") {
		menu.addItem((item) =>
			item
				.setTitle("Enter mode")
				.setIcon("corner-down-left")
				.onClick(() => void activate("primary", result)),
		);
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
		menu.addItem((item) =>
			item
				.setTitle("Run command")
				.setIcon("play")
				.onClick(() => void activate("primary", result)),
		);
		return;
	}

	/** Opens the terminal and reports failures without leaving the palette behind. */
	const openTerminal = (absolutePath: string, isFolder: boolean): void => {
		onNoteActionSelected?.();
		void openDirectoryInTerminal(getTerminalDirectory(absolutePath, isFolder)).then((error) => {
			if (error) new Notice(error);
		});
	};

	if (result.mode === "plugin" || result.mode === "snippet") {
		// Why: plugin folders and snippet files have no Obsidian view, so skip leaf
		// navigation and note actions (MOC, tags) and offer only external opening.
		// Plugins additionally offer their settings tab when one exists.
		menu.addItem((item) =>
			item
				.setTitle("Open in external editor")
				.setIcon("code")
				.onClick(() => void activate("primary", result)),
		);
		if (isDesktopApp()) {
			const externalPath = getResultAbsolutePath(app, result);
			if (externalPath) {
				const externalFolder = isFolderResult(result);
				menu.addItem((item) =>
					item
						.setTitle("Show in system explorer")
						.setIcon("folder-open")
						.onClick(() => {
							onNoteActionSelected?.();
							showInSystemExplorer(externalPath, externalFolder);
						}),
				);
				menu.addItem((item) =>
					item
						.setTitle("Open in terminal")
						.setIcon("terminal")
						.onClick(() => openTerminal(externalPath, externalFolder)),
				);
			}
		}
		if (result.mode === "plugin" && result.hasSettings) {
			const pluginId = result.pluginId;
			menu.addItem((item) =>
				item
					.setTitle("Open plugin settings")
					.setIcon("settings")
					.onClick(() => {
						onNoteActionSelected?.();
						openPluginSettings(app, pluginId);
					}),
			);
		}
		addCopyPathMenuItems(
			menu,
			getCopyablePaths(app, result),
			(path) => void copyPathToClipboard(path),
		);
		return;
	}

	const paths = getCopyablePaths(app, result);
	menu.addItem((item) =>
		item
			.setTitle("Open")
			.setIcon("external-link")
			.onClick(() => void activate("primary", result)),
	);
	// Why: only popout hosts provide this action; ordinary palettes already open
	// in the main window and should not offer a redundant navigation command.
	if (openInMainWindow) {
		menu.addItem((item) =>
			item
				.setTitle("Open in main window")
				.setIcon("app-window")
				.onClick(() => void openInMainWindow(result)),
		);
	}
	menu.addItem((item) =>
		item
			.setTitle("Open in new tab (background)")
			.setIcon("panel-top-open")
			.onClick(() => void openInBackground(result)),
	);
	menu.addItem((item) =>
		item
			.setTitle("Open side by side")
			.setIcon("separator-vertical")
			.onClick(() => void activate("vertical", result)),
	);
	menu.addItem((item) =>
		item
			.setTitle("Open below")
			.setIcon("separator-horizontal")
			.onClick(() => void activate("horizontal", result)),
	);
	const absolutePath = isDesktopApp() ? getResultAbsolutePath(app, result) : undefined;
	if (absolutePath) {
		// Why: external-app actions apply to every file result, not only Everything.
		// "Show in system explorer" unifies the old Everything-only "Show in file explorer",
		// which was confused with Obsidian's file explorer.
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Open in external editor")
				.setIcon("code")
				.onClick(() => {
					onNoteActionSelected?.();
					void openInExternalEditor(absolutePath);
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle("Show in system explorer")
				.setIcon("folder-open")
				.onClick(() => {
					onNoteActionSelected?.();
					showInSystemExplorer(absolutePath, isFolderResult(result));
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle("Open in terminal")
				.setIcon("terminal")
				.onClick(() => openTerminal(absolutePath, isFolderResult(result))),
		);
	}
	addCopyPathMenuItems(menu, paths, (path) => void copyPathToClipboard(path));
	addFileMoveMenuItem(menu, plugin, [result], onNoteActionDone);
	addBulkRenameMenuItem(menu, plugin, [result], onNoteActionDone);
	addPropertyEditMenuItem(menu, plugin, [result], onNoteActionSelected);
	// Why: MOC insertion mutates multiple notes, so keep it after navigation and
	// non-mutating copy actions in both palette surfaces.
	addMocInsertionMenuItem(menu, plugin, result, onNoteActionSelected, getMocContext);
	addTagInsertionMenuItems(menu, plugin, [result], onNoteActionDone);
	// Why: a selection of search bookmarks has no paths, so it reaches this single-result
	// menu; bookmark actions still apply to every selected bookmark.
	addBookmarkMenuItems({
		menu,
		plugin,
		results: targets,
		onBookmarksChanged: onResultsChanged,
		onNoteActionDone,
	});
}
