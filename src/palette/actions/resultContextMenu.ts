import type { App, Menu } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { MocInsertionContext } from "src/moc-relateds/mocInsertion";
import { addMocInsertionMenuItem, addMocInsertionMenuItems } from "src/moc-relateds/mocInsertion";
import type { ActionKind } from "src/palette/resultActions";
import { getCopyablePaths, isCopyablePaletteResult } from "src/palette/resultPresentation";
import type { PaletteResult } from "src/palette/results";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { addTagInsertionMenuItems } from "src/tags/tagInsertionMenu";

interface PaletteResultMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: Menu;
	result: PaletteResult;
	selectedItems: PaletteResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	openInBackground: (result: PaletteResult) => void | Promise<void>;
	openInMainWindow?: (result: PaletteResult) => void | Promise<void>;
	applySearchHistory: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
	/** Lets a modal palette close before an action that opens its own modal or edits notes. */
	onNoteActionSelected?: () => void;
	getMocContext?: () => MocInsertionContext;
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
	getMocContext,
}: PaletteResultMenuOptions): void {
	const selectedPaths = selectedItems
		.filter(isCopyablePaletteResult)
		.map((item) => getCopyablePaths(app, item))
		.filter(({ fileName, relativePath, absolutePath }) =>
			Boolean(fileName || relativePath || absolutePath),
		);
	if (selectedPaths.length > 1) {
		// Why: a multi-selection has no single result for navigation actions, so expose
		// actions that can operate on all selected paths or notes.
		addCopyPathListMenuItems(
			menu,
			selectedPaths,
			(values) => void copyPathListToClipboard(values),
		);
		addMocInsertionMenuItems(menu, plugin, selectedItems, onNoteActionSelected, getMocContext);
		addTagInsertionMenuItems(menu, plugin, selectedItems, onNoteActionSelected);
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
	if (result.mode === "command") {
		menu.addItem((item) =>
			item
				.setTitle("Run command")
				.setIcon("play")
				.onClick(() => void activate("primary", result)),
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
	if (result.mode === "everything") {
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Show in file explorer")
				.setIcon("folder-open")
				.onClick(() => void activate("alternate", result)),
		);
	}
	addCopyPathMenuItems(menu, paths, (path) => void copyPathToClipboard(path));
	// Why: MOC insertion mutates multiple notes, so keep it after navigation and
	// non-mutating copy actions in both palette surfaces.
	addMocInsertionMenuItem(menu, plugin, result, onNoteActionSelected, getMocContext);
	addTagInsertionMenuItems(menu, plugin, [result], onNoteActionSelected);
}
