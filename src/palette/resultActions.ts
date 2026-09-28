import { Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { getLeafForAction, type LeafOpenAction } from "src/workspace/openLeaf";
import { getVaultFullPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import { resolveExternalOpenTarget, type ExternalOpenTarget } from "src/palette/openTargets";

declare const electron: {
	shell: {
		showItemInFolder: (path: string) => void;
		openPath: (path: string) => Promise<string>;
		openExternal: (url: string) => Promise<void>;
	};
};
import type { EverythingResult, PaletteResult } from "src/palette/results";

export type ActionKind = LeafOpenAction;
export interface ActionOutcome {
	close: boolean;
	message?: string;
}

interface ExternalMarkdownActions {
	openExternalMarkdownInObsidian: boolean;
	openExternalMarkdown: (
		absolutePath: string,
		action: ActionKind,
		active?: boolean,
		targetLeaf?: WorkspaceLeaf,
	) => Promise<void>;
}

export interface ResultActionOptions {
	/** Existing本文leaf used by a persistent palette for primary opens. */
	targetLeaf?: WorkspaceLeaf;
	/** Whether a primary external/open-file action should focus its target. */
	active?: boolean;
}

async function openExternalTarget(
	target: ExternalOpenTarget,
	action: ActionKind,
	externalMarkdown: ExternalMarkdownActions,
	active: boolean,
	targetLeaf?: WorkspaceLeaf,
): Promise<ActionOutcome> {
	if (target.kind === "markdown") {
		await externalMarkdown.openExternalMarkdown(
			target.absolutePath,
			action,
			active,
			targetLeaf,
		);
		return { close: true };
	}
	await electron.shell.openPath(target.absolutePath);
	return { close: true };
}

export async function runResultAction(
	app: App,
	result: PaletteResult,
	action: ActionKind,
	externalMarkdown: ExternalMarkdownActions,
	options: ResultActionOptions = {},
): Promise<ActionOutcome> {
	if (result.mode === "file") {
		const ignored = result.ignored || isUserIgnoredPath(app, result.vaultPath);
		if (ignored) {
			const absolutePath = getVaultFullPath(app, result.vaultPath);
			if (!absolutePath)
				return {
					close: false,
					message: "This vault adapter cannot resolve an absolute path.",
				};
			try {
				await getDesktopAdapter(app).fs.promises.stat(absolutePath);
			} catch {
				return { close: false, message: "The selected path no longer exists." };
			}
			// Ignored results are an inspection scope. Keep the source untouched;
			// MOC link insertion owns the separate copy/materialize workflow.
			const target = resolveExternalOpenTarget(absolutePath, {
				openMarkdownInObsidian: externalMarkdown.openExternalMarkdownInObsidian,
			});
			return await openExternalTarget(
				target,
				action,
				externalMarkdown,
				options.active ?? true,
				options.targetLeaf,
			);
		}
		const current = app.vault.getAbstractFileByPath(result.vaultPath);
		if (!(current instanceof TFile))
			return { close: false, message: "The file no longer exists." };
		const leaf = getLeafForAction(app, action, options.targetLeaf);
		await leaf.openFile(
			current,
			action === "primary" ? { active: options.active ?? true } : undefined,
		);
		return { close: true };
	}
	if (result.mode === "command") return { close: true };
	if (result.mode === "link" || result.mode === "backlink")
		return { close: false, message: "This result must be opened by the related-file palette." };
	const everythingResult = result as EverythingResult;
	try {
		await getDesktopAdapter(app).fs.promises.stat(everythingResult.absolutePath);
	} catch {
		return { close: false, message: "The selected path no longer exists." };
	}
	if (action === "alternate") {
		if (everythingResult.kind === "folder")
			await electron.shell.openPath(everythingResult.absolutePath);
		else electron.shell.showItemInFolder(everythingResult.absolutePath);
	} else if (everythingResult.vaultPath) {
		const current = app.vault.getAbstractFileByPath(everythingResult.vaultPath);
		if (current instanceof TFile) {
			const leaf = getLeafForAction(app, action, options.targetLeaf);
			await leaf.openFile(
				current,
				action === "primary" ? { active: options.active ?? true } : undefined,
			);
			return { close: true };
		}
	}
	const target = resolveExternalOpenTarget(everythingResult.absolutePath, {
		openMarkdownInObsidian: externalMarkdown.openExternalMarkdownInObsidian,
	});
	return await openExternalTarget(
		target,
		action,
		externalMarkdown,
		options.active ?? true,
		options.targetLeaf,
	);
}

export function notifyActionError(message: string): void {
	new Notice(message);
}
