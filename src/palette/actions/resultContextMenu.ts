import type { App, Menu } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { MocInsertionContext } from "src/moc-relateds/mocInsertion";
import { addMocInsertionMenuItem } from "src/moc-relateds/mocInsertion";
import type { ActionKind } from "src/palette/resultActions";
import { getCopyablePaths, isCopyablePaletteResult } from "src/palette/resultPresentation";
import type { PaletteResult } from "src/palette/results";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";

interface PaletteResultMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: Menu;
	result: PaletteResult;
	selectedItems: PaletteResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	openInBackground: (result: PaletteResult) => void | Promise<void>;
	applySearchHistory: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
	onMocSelected?: () => void;
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
	applySearchHistory,
	onMocSelected,
	getMocContext,
}: PaletteResultMenuOptions): void {
	const selectedPaths = selectedItems
		.filter(isCopyablePaletteResult)
		.map((item) => getCopyablePaths(app, item))
		.filter(({ fileName, relativePath, absolutePath }) =>
			Boolean(fileName || relativePath || absolutePath),
		);
	if (selectedPaths.length > 1) {
		// Why: opening or mutating heterogeneous selections has ambiguous focus and
		// failure semantics, while copying their paths is deterministic and safe.
		addCopyPathListMenuItems(
			menu,
			selectedPaths,
			(values) => void copyPathListToClipboard(values),
		);
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
	addMocInsertionMenuItem(menu, plugin, result, onMocSelected, getMocContext);
}
