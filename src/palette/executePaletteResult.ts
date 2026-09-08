import { type App, type WorkspaceLeaf } from "obsidian";
import { getLeafForAction } from "src/app/openLeaf";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/model/results";
import { runResultAction, type ActionKind } from "src/palette/resultActions";

export interface PaletteResultExecutionOptions {
	/** Keep the persistent panel alive after a successful action. */
	closeWhenDone: boolean;
	/** The本文 leaf that a primary open should replace. */
	targetLeaf?: WorkspaceLeaf;
	/** Persistent sidebars keep focus in the search input while zapping notes. */
	active: boolean;
	/** Modal's ArrowRight preview keeps the target active but avoids editor focus. */
	externalAutoFocus?: boolean;
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
	if (result.mode === "search-history") return;
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
			(
				plugin.app.commands as unknown as { executeCommandById: (id: string) => boolean }
			).executeCommandById(result.commandId);
		});
		return;
	}

	if (result.mode === "bookmark") {
		const opened = await executeBookmark(plugin.app, result, action, options);
		if (opened) {
			plugin.recordResultUsage(result);
			finish(options);
		}
		return;
	}
	if (result.mode === "smart") {
		await openFileResult(plugin.app, result, action, options);
		plugin.recordResultUsage(result);
		finish(options);
		return;
	}
	if (result.mode === "link" || result.mode === "backlink") {
		const openedLeaf = await openFileResult(plugin.app, result, action, options);
		plugin.recordResultUsage(result);
		// A pinned target may resolve to a fallback leaf; place the cursor on the
		// leaf that actually received the related note, including split actions.
		const editor = editorOf(openedLeaf);
		if (editor) editor.setCursor({ line: result.line, ch: 0 });
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
					options.externalAutoFocus ?? active,
					active,
					targetLeaf,
				),
		},
		{
			targetLeaf: options.targetLeaf,
			active: options.active,
		},
	);
	if (outcome.close) {
		plugin.recordResultUsage(result);
		finish(options);
	} else options.showError(outcome.message ?? "The action failed.");
}

async function executeBookmark(
	app: App,
	result: Extract<PaletteResult, { mode: "bookmark" }>,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<boolean> {
	if (result.kind === "search" && result.query) {
		await app.workspace.openLinkText(result.query, "", true);
		return true;
	}
	if (!result.file) return false;
	const leaf = getLeafForAction(app, action, options.targetLeaf);
	await leaf.openFile(result.file, action === "primary" ? { active: options.active } : undefined);
	return true;
}

async function openFileResult(
	app: App,
	result: Extract<PaletteResult, { mode: "smart" | "link" | "backlink" }>,
	action: ActionKind,
	options: PaletteResultExecutionOptions,
): Promise<WorkspaceLeaf> {
	const leaf = getLeafForAction(app, action, options.targetLeaf);
	await leaf.openFile(result.file, action === "primary" ? { active: options.active } : undefined);
	return leaf;
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
