import { Notice, type App } from "obsidian";
import {
	canTrash,
	describeAuditActionResults,
	listsFiles,
	plural,
	trashAuditItems,
} from "src/audit/auditActions";
import type { AuditKind } from "src/audit/vaultAudit";
import type MyPalettePlugin from "src/main";
import { addFileMoveMenuItem } from "src/palette/actions/fileMoveMenu";
import { addSelectionHeader } from "src/palette/actions/selectionHeader";
import type { ActionKind } from "src/palette/resultActions";
import { getCopyablePaths } from "src/palette/resultPresentation";
import type { AuditBrokenLinkResult, AuditResult, PaletteResult } from "src/palette/results";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { ICONS } from "src/ui/icons";
import type { PaletteMenu, PaletteMenuItem } from "src/ui/paletteMenu";

/** Enough to find a note in the menu; the rest is one search away in the note itself. */
const MAX_LINKED_NOTES = 20;

export function isAuditResult(result: PaletteResult): result is AuditResult {
	return result.mode === "audit";
}

interface AuditMenuOptions {
	app: App;
	plugin: MyPalettePlugin;
	menu: PaletteMenu;
	results: readonly AuditResult[];
	activate: (action: ActionKind, result: PaletteResult) => void | Promise<void>;
	/** Lets a modal palette close before a linked note opens. */
	onNoteActionSelected?: () => void;
	/** Lists again after items were moved, for a palette that does not follow vault changes. */
	onResultsChanged?: () => void;
}

/**
 * Audit rows get their own menu: they list things to tidy up, so note actions such as
 * MOC and tags do not apply.
 */
export function populateAuditMenu(options: AuditMenuOptions): void {
	const { app, menu, results, activate } = options;
	const [first] = results;
	if (!first) return;
	if (results.length === 1) {
		menu.addItem((item) =>
			item
				.setTitle(openTitle(first))
				.setIcon(first.kind === "empty-folders" ? ICONS.revealInFileExplorer : ICONS.open)
				.onClick(() => void activate("primary", first)),
		);
		if (first.kind === "broken-links") addLinkedNoteItems(options, first);
		addCopyPathMenuItems(
			menu,
			getCopyablePaths(app, first),
			(path) => void copyPathToClipboard(path),
		);
	} else {
		addSelectionHeader(menu, results.length);
		addCopyPathListMenuItems(
			menu,
			results.map((result) => getCopyablePaths(app, result)),
			(values) => void copyPathListToClipboard(values),
		);
	}
	addMoveItems(options, first.kind);
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

/** Every note with the broken link, each opening at the line of the link. */
function addLinkedNoteItems(
	{ app, menu, onNoteActionSelected }: AuditMenuOptions,
	result: AuditBrokenLinkResult,
): void {
	if (result.sources.length < 2) return;
	menu.addSeparator();
	menu.addHeading("Linked from");
	for (const source of result.sources.slice(0, MAX_LINKED_NOTES)) {
		const line = source.line === undefined ? "" : `:${source.line + 1}`;
		menu.addItem((item) =>
			item
				.setTitle(`${source.path}${line}`)
				.setIcon(ICONS.note)
				.onClick(() => {
					const file = app.vault.getFileByPath(source.path);
					if (!file) {
						new Notice("The note no longer exists.");
						return;
					}
					onNoteActionSelected?.();
					void app.workspace
						.getLeaf(false)
						.openFile(file, { eState: { line: source.line } });
				}),
		);
	}
	const rest = result.sources.length - MAX_LINKED_NOTES;
	if (rest > 0)
		menu.addItem((item) => item.setTitle(`${plural(rest, "more link")}`).setDisabled(true));
}

function addMoveItems(options: AuditMenuOptions, kind: AuditKind): void {
	const { menu, plugin, results, onResultsChanged } = options;
	if (!canTrash(kind)) return;
	menu.addSeparator();
	// Why: files to keep go to a folder of the user's choice, as from any other mode; one left
	// out by Excluded folders there stays out of these lists too.
	if (listsFiles(kind)) addFileMoveMenuItem(menu, plugin, results, onResultsChanged);
	addTrashItem(options, kind);
}

/**
 * Trashing several items at once is hard to undo, so the first press turns the item into a
 * confirmation that keeps the menu open, as Delete property does; the second press moves.
 */
function addTrashItem(
	{ app, menu, results, onResultsChanged }: AuditMenuOptions,
	kind: AuditKind,
): void {
	const what = plural(results.length, kind === "empty-folders" ? "folder" : "file");
	let confirming = false;
	let moveItem: PaletteMenuItem | undefined;
	const render = (item: PaletteMenuItem) => {
		item.setTitle(confirming ? `Click again to move ${what} to trash` : "Move to trash")
			.setIcon(ICONS.delete)
			.setWarning(true)
			.setCta(confirming)
			.setKeepOpen(confirming);
		if (kind === "empty-folders")
			item.setTooltip(
				"Files Obsidian does not show, such as those starting with a dot, go with the folder.",
			);
	};
	menu.addItem((item) => {
		moveItem = item;
		render(item);
		item.onClick(() => {
			if (!confirming) {
				confirming = true;
				render(item);
				return;
			}
			void (async () => {
				const outcome = await trashAuditItems(app, kind, results.map(itemPath));
				new Notice(describeAuditActionResults(kind, outcome));
				onResultsChanged?.();
			})();
		});
	});
	// Why: moving to another item cancels the confirmation, so a later press starts over.
	menu.onSelectionChange((selected) => {
		if (!confirming || !moveItem || selected === moveItem) return;
		confirming = false;
		render(moveItem);
	});
}

function itemPath(result: AuditResult): string {
	switch (result.kind) {
		case "orphaned-files":
		case "empty-files":
			return result.file.path;
		case "empty-folders":
			return result.folderPath;
		case "broken-links":
			return result.link;
	}
}
