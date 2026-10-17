import { Notice, type App } from "obsidian";
import {
	canTrash,
	describeAuditActionResults,
	listsFiles,
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
import type { PaletteMenu } from "src/ui/paletteMenu";
import { countLabel } from "src/shared/countLabel";
import { t } from "src/i18n";

/** メニューでノートを見つけるのに十分な数。残りは、ノート自体の中で1回の検索で見つかる。 */
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
	/** リンク先のノートを開く前に、モーダルのパレットを閉じられるようにする。 */
	onNoteActionSelected?: () => void;
	/** 項目を移動したあとに一覧を作り直す。Vault の変更に追従しないパレット向け。 */
	onResultsChanged?: () => void;
}

/**
 * 監査の行は独自のメニューを持つ。片付けるものの一覧なので、MOC やタグのような
 * ノートの操作は当てはまらない。
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
				.setSearchTerms("open-audit-result")
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
			return t("menu.open");
		case "broken-links":
			return t("audit.menu.openLinkingNote");
		case "empty-folders":
			return t("menu.revealInSystemExplorer");
	}
}

/** 壊れたリンクを持つすべてのノート。それぞれ、リンクのある行で開く。 */
function addLinkedNoteItems(
	{ app, menu, onNoteActionSelected }: AuditMenuOptions,
	result: AuditBrokenLinkResult,
): void {
	if (result.sources.length < 2) return;
	menu.addSeparator();
	menu.addHeading(t("audit.menu.linkedFrom"));
	for (const source of result.sources.slice(0, MAX_LINKED_NOTES)) {
		const line = source.line === undefined ? "" : `:${source.line + 1}`;
		menu.addItem((item) =>
			item
				.setTitle(`${source.path}${line}`)
				.setIcon(ICONS.note)
				.setSearchTerms("open-linking-note")
				.onClick(() => {
					const file = app.vault.getFileByPath(source.path);
					if (!file) {
						new Notice(t("audit.noteGone"));
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
		menu.addItem((item) =>
			item.setTitle(t("audit.menu.moreLinks", { count: rest })).setDisabled(true),
		);
}

function addMoveItems(options: AuditMenuOptions, kind: AuditKind): void {
	const { menu, plugin, results, onResultsChanged } = options;
	if (!canTrash(kind)) return;
	menu.addSeparator();
	// Why: 残すファイルは、ほかのモードと同じく、ユーザーが選んだフォルダーに移す。
	// 除外フォルダーで外されたものは、ここの一覧にも入れない。
	if (listsFiles(kind)) addFileMoveMenuItem(menu, plugin, results, onResultsChanged);
	addTrashItem(options, kind);
}

/** 複数の項目をまとめてゴミ箱に入れるのは元に戻しにくいので、移動には2回押しが必要。 */
function addTrashItem(
	{ app, menu, results, onResultsChanged }: AuditMenuOptions,
	kind: AuditKind,
): void {
	const what = countLabel(results.length, kind === "empty-folders" ? "フォルダー" : "ファイル");
	menu.addConfirmedItem({
		title: t("audit.menu.trash"),
		confirmTitle: t("audit.menu.trashConfirm", { what }),
		id: "move-to-trash",
		icon: ICONS.delete,
		warning: true,
		...(kind === "empty-folders"
			? {
					tooltip: t("audit.menu.trashFolderTooltip"),
				}
			: {}),
		run: () =>
			void (async () => {
				const outcome = await trashAuditItems(app, kind, results.map(itemPath));
				new Notice(describeAuditActionResults(kind, outcome));
				onResultsChanged?.();
			})(),
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
