import type { TFile, WorkspaceLeaf } from "obsidian";
import { openFileInLeaf } from "src/workspace/openLeaf";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { runResultAction, type ActionKind } from "src/palette/resultActions";
import { openInExternalEditor } from "src/platform/externalOpen";
import { editPropertyResult } from "src/properties/propertyActions";
import { executeCommandById } from "src/platform/obsidianInternals";

export interface PaletteResultExecutionOptions {
	/** Keep the persistent panel alive after a successful action. */
	closeWhenDone: boolean;
	/** The本文 leaf that a primary open should replace. */
	targetLeaf?: WorkspaceLeaf;
	/** Explicit new-tab actions must bypass external Markdown tab reuse. */
	reuseExternalMarkdownLeaf?: boolean;
	/** Normal opens activate the destination; background actions remain separate. */
	active: boolean;
	/** Modal's ArrowRight preview keeps the target active but avoids editor focus. */
	autoFocus?: boolean;
	close: () => void;
	showError: (message: string) => void;
}

/**
 * Routes every result mode through one host-neutral action path. A modal and a
 * persistent view differ only in whether they close and which target leaf they
 * supply; opening and validation rules stay identical.
 */
export async function executePaletteResult(
	plugin: MyPalettePlugin,
	result: PaletteResult,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<void> {
	// Hosts handle these before execution: they change the palette, not the workspace.
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
			options.showError("The selected command no longer exists.");
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
		// Switching tabs opens nothing, so every action simply activates the tab;
		// the preview keeps editor focus out.
		const leaf = plugin.tabProvider.leafOf(result.id);
		if (!leaf) {
			options.showError("The selected tab no longer exists.");
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
		// A pinned target may resolve to a fallback leaf; place the cursor on the
		// leaf that actually received the related note, including split actions.
		const editor = editorOf(openedLeaf);
		if (editor) editor.setCursor({ line: result.line, ch: 0 });
		finish(options);
		return;
	}
	if (result.mode === "plugin" || result.mode === "snippet") {
		// Why: plugin folders and snippet files have no Obsidian view; Enter hands
		// them to the external editor like the quick-open flow did.
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
	} else options.showError(outcome.message ?? "The action failed.");
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
