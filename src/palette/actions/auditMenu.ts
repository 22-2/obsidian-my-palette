import type { App } from "obsidian";
import { addSelectionHeader } from "src/palette/actions/selectionHeader";
import type { ActionKind } from "src/palette/resultActions";
import { getCopyablePaths } from "src/palette/resultPresentation";
import type { AuditResult, PaletteResult } from "src/palette/results";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import type { PaletteMenu } from "src/ui/paletteMenu";

export function isAuditResult(result: PaletteResult): result is AuditResult {
	return result.mode === "audit";
}

interface AuditMenuOptions {
	app: App;
	menu: PaletteMenu;
	results: readonly AuditResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
}

/**
 * Audit rows get their own menu: they list things to tidy up, so note actions such as
 * MOC and tags do not apply.
 */
export function populateAuditMenu({ app, menu, results, activate }: AuditMenuOptions): void {
	const [first] = results;
	if (!first) return;
	if (results.length === 1) {
		menu.addItem((item) =>
			item
				.setTitle(openTitle(first))
				.setIcon(first.kind === "empty-folders" ? "folder-open" : "file-input")
				.onClick(() => void activate("primary", first)),
		);
		addCopyPathMenuItems(
			menu,
			getCopyablePaths(app, first),
			(path) => void copyPathToClipboard(path),
		);
		return;
	}
	addSelectionHeader(menu, results.length);
	addCopyPathListMenuItems(
		menu,
		results.map((result) => getCopyablePaths(app, result)),
		(values) => void copyPathListToClipboard(values),
	);
}

function openTitle(result: AuditResult): string {
	switch (result.kind) {
		case "orphaned-files":
		case "empty-files":
			return "Open";
		case "broken-links":
			return "Open linking note";
		case "empty-folders":
			return "Reveal in file explorer";
	}
}
