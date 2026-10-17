import type { TFile, WorkspaceLeaf } from "obsidian";
import { revealInFileExplorer } from "src/platform/obsidianInternals";
import { openFileInLeaf } from "src/workspace/openLeaf";
import type MyPalettePlugin from "src/main";
import type { AuditResult, PaletteResult } from "src/palette/results";
import { runResultAction, type ActionKind } from "src/palette/resultActions";
import { openInExternalEditor } from "src/platform/externalOpen";
import { editPropertyResult } from "src/properties/propertyActions";
import { executeCommandById } from "src/platform/obsidianInternals";
import { t } from "src/i18n";

export interface PaletteResultExecutionOptions {
	/** 成功した操作のあとも、常駐のパネルを残す。 */
	closeWhenDone: boolean;
	/** 主な開く操作が置き換える本文のリーフ。 */
	targetLeaf?: WorkspaceLeaf;
	/** 明示的な新しいタブの操作は、外部 Markdown のタブの再利用を迂回しなければならない。 */
	reuseExternalMarkdownLeaf?: boolean;
	/** 通常の開く操作は移動先を有効にする。裏で開く操作は別に扱う。 */
	active: boolean;
	/** モーダルの右矢印によるプレビューは、対象を有効にしつつエディターにフォーカスしない。 */
	autoFocus?: boolean;
	close: () => void;
	showError: (message: string) => void;
}

/**
 * すべての結果のモードを、ホストに依存しない1つの操作の経路で処理する。モーダルと常駐のビューの違いは、
 * 閉じるかどうかと、どの対象リーフを渡すかだけ。開く操作と検証のルールは同じまま。
 */
export async function executePaletteResult(
	plugin: MyPalettePlugin,
	result: PaletteResult,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<void> {
	// これらはホストが実行の前に処理する。ワークスペースではなく、パレットを変えるため。
	if (result.mode === "search-history" || result.mode === "mode-entry") return;
	if (result.mode === "property") {
		if (action !== "primary") return;
		if ((await editPropertyResult(plugin, result)) === "close") finish(options);
		return;
	}
	if (result.mode === "command") {
		if (action !== "primary") return;
		const exists = plugin.commandProvider
			.getCommands()
			.some(({ id }) => id === result.commandId);
		if (!exists) {
			options.showError(t("palette.error.commandGone"));
			return;
		}
		plugin.recordCommand(result.commandId);
		if (options.closeWhenDone) options.close();
		window.queueMicrotask(() => {
			executeCommandById(plugin.app, result.commandId);
		});
		return;
	}

	if (result.mode === "bookmark") {
		const opened = await executeBookmark(plugin, result, action, options);
		if (opened) {
			plugin.recordResultUsage(result);
			finish(options);
		}
		return;
	}
	if (result.mode === "tab") {
		// タブを切り替えても何も開かないので、どの操作もタブを有効にするだけ。
		// プレビューはエディターにフォーカスを渡さない。
		const leaf = plugin.tabProvider.leafOf(result.id);
		if (!leaf) {
			options.showError(t("palette.error.tabGone"));
			return;
		}
		plugin.app.workspace.setActiveLeaf(leaf, { focus: options.autoFocus ?? true });
		finish(options);
		return;
	}
	if (result.mode === "smart") {
		await openFileResult(plugin, result.file, action, options);
		plugin.recordResultUsage(result);
		finish(options);
		return;
	}
	if (result.mode === "link" || result.mode === "backlink") {
		const openedLeaf = await openFileResult(plugin, result.file, action, options);
		plugin.recordResultUsage(result);
		// 固定された対象は、予備のリーフに解決されることがある。分割する操作も含め、
		// 関連するノートを実際に受け取ったリーフにカーソルを置く。
		const editor = editorOf(openedLeaf);
		if (editor) editor.setCursor({ line: result.line, ch: 0 });
		finish(options);
		return;
	}
	if (result.mode === "audit") {
		if (await executeAuditResult(plugin, result, action, options)) finish(options);
		return;
	}
	if (result.mode === "plugin" || result.mode === "snippet") {
		// Why: プラグインのフォルダーとスニペットのファイルには Obsidian のビューがないので、
		// Enter で外部エディターに渡す。クイックオープンの流れと同じ。
		const error = await openInExternalEditor(result.absolutePath);
		if (error) {
			options.showError(error);
			return;
		}
		finish(options);
		return;
	}

	const outcome = await runResultAction(
		plugin.app,
		result,
		action,
		{
			openExternalMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
			openExternalMarkdown: (
				absolutePath,
				openAction,
				active = options.active,
				targetLeaf = options.targetLeaf,
			) =>
				plugin.openExternalMarkdown(
					absolutePath,
					openAction,
					options.autoFocus ?? active,
					active,
					targetLeaf,
					options.reuseExternalMarkdownLeaf ?? true,
				),
		},
		{
			targetLeaf: options.targetLeaf,
			active: options.active,
			autoFocus: options.autoFocus,
			focusExistingTab: plugin.settings.focusExistingTab,
		},
	);
	if (outcome.close) {
		plugin.recordResultUsage(result);
		finish(options);
	} else options.showError(outcome.message ?? t("palette.error.actionFailed"));
}

async function executeBookmark(
	plugin: MyPalettePlugin,
	result: Extract<PaletteResult, { mode: "bookmark" }>,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<boolean> {
	if (result.kind === "search" && result.query) {
		await plugin.app.workspace.openLinkText(result.query, "", true);
		return true;
	}
	if (!result.file) return false;
	await openFileResult(plugin, result.file, action, options);
	return true;
}

/** 監査の行が指すものを開く。存在しなければ false を返す。 */
async function executeAuditResult(
	plugin: MyPalettePlugin,
	result: AuditResult,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<boolean> {
	const { vault } = plugin.app;
	switch (result.kind) {
		case "orphaned-files":
		case "empty-files":
			await openFileResult(plugin, result.file, action, options);
			return true;
		case "broken-links": {
			// Why: 存在しない先は開けないので、リンクが書かれている場所に移動する。
			const [source] = result.sources;
			const file = source ? vault.getFileByPath(source.path) : null;
			if (!source || !file) {
				options.showError(t("audit.error.linkNoteGone"));
				return false;
			}
			const leaf = await openFileResult(plugin, file, action, options);
			if (source.line !== undefined) editorOf(leaf)?.setCursor({ line: source.line, ch: 0 });
			return true;
		}
		case "empty-folders": {
			const folder = vault.getFolderByPath(result.folderPath);
			if (!folder) {
				options.showError(t("audit.error.folderGone"));
				return false;
			}
			if (revealInFileExplorer(plugin.app, folder)) return true;
			options.showError(t("audit.error.enableExplorer"));
			return false;
		}
	}
}

async function openFileResult(
	plugin: MyPalettePlugin,
	file: TFile,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<WorkspaceLeaf> {
	return openFileInLeaf(plugin.app, file, {
		action,
		targetLeaf: options.targetLeaf,
		active: options.active,
		autoFocus: options.autoFocus ?? true,
		focusExisting: plugin.settings.focusExistingTab,
	});
}

function editorOf(
	leaf: WorkspaceLeaf | null | undefined,
): { setCursor: (position: { line: number; ch: number }) => void } | undefined {
	const editor = (leaf?.view as { editor?: unknown } | undefined)?.editor;
	return editor && typeof (editor as { setCursor?: unknown }).setCursor === "function"
		? (editor as { setCursor: (position: { line: number; ch: number }) => void })
		: undefined;
}

function finish(options: PaletteResultExecutionOptions): void {
	if (options.closeWhenDone) options.close();
}
