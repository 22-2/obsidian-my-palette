import { Notice, TFile, type App } from "obsidian";
import {
	getVaultFullPath,
	isAbsolutePathUserIgnored,
	isUserIgnoredPath,
} from "src/core/ignoredPaths";
import { getDesktopAdapter } from "src/core/desktopAdapter";

declare const electron: {
	shell: {
		showItemInFolder: (path: string) => void;
		openPath: (path: string) => Promise<string>;
		openExternal: (url: string) => Promise<void>;
	};
};
import type { EverythingResult, PaletteResult } from "src/model/results";
import { isMarkdownPath } from "src/core/externalFiles";
import { openPathInCode } from "src/core/vscode";

export type ActionKind = "primary" | "alternate" | "tertiary";
export interface ActionOutcome {
	close: boolean;
	message?: string;
}

interface ExternalMarkdownActions {
	openExternalMarkdownInObsidian: boolean;
	openExternalMarkdown: (absolutePath: string, action: ActionKind) => Promise<void>;
}

async function openVaultFileInCode(app: App, vaultPath: string): Promise<ActionOutcome> {
	const absolutePath = getVaultFullPath(app, vaultPath);
	if (!absolutePath)
		return { close: false, message: "This vault adapter cannot resolve an absolute path." };
	return await openAbsolutePathInCode(absolutePath);
}

async function openAbsolutePathInCode(absolutePath: string): Promise<ActionOutcome> {
	const error = await openPathInCode(absolutePath);
	return error ? { close: false, message: error } : { close: true };
}

export async function runResultAction(
	app: App,
	result: PaletteResult,
	action: ActionKind,
	externalMarkdown: ExternalMarkdownActions,
): Promise<ActionOutcome> {
	if (result.mode === "file") {
		if (isUserIgnoredPath(app, result.vaultPath))
			return await openVaultFileInCode(app, result.vaultPath);
		const current = app.vault.getAbstractFileByPath(result.vaultPath);
		if (!(current instanceof TFile))
			return { close: false, message: "The file no longer exists." };
		const leaf =
			action === "alternate"
				? app.workspace.getLeaf("tab")
				: action === "tertiary"
					? app.workspace.getLeaf("split", "vertical")
					: app.workspace.getLeaf(false);
		await leaf.openFile(current);
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
	if (action === "tertiary") {
		const editor = app.workspace.activeEditor?.editor;
		if (!editor)
			return { close: false, message: "Open a Markdown editor before inserting a path." };
		editor.replaceSelection(everythingResult.absolutePath);
	} else if (action === "alternate") {
		if (everythingResult.kind === "folder")
			await electron.shell.openPath(everythingResult.absolutePath);
		else electron.shell.showItemInFolder(everythingResult.absolutePath);
	} else if (everythingResult.vaultPath) {
		const current = app.vault.getAbstractFileByPath(everythingResult.vaultPath);
		if (current instanceof TFile) await app.workspace.getLeaf(false).openFile(current);
		else {
			if (isMarkdownPath(everythingResult.absolutePath)) {
				if (externalMarkdown.openExternalMarkdownInObsidian) {
					await externalMarkdown.openExternalMarkdown(
						everythingResult.absolutePath,
						action,
					);
					return { close: true };
				}
				return await openAbsolutePathInCode(everythingResult.absolutePath);
			}
			return await openAbsolutePathInCode(everythingResult.absolutePath);
		}
	} else if (isMarkdownPath(everythingResult.absolutePath)) {
		if (externalMarkdown.openExternalMarkdownInObsidian) {
			await externalMarkdown.openExternalMarkdown(everythingResult.absolutePath, action);
			return { close: true };
		}
		return await openAbsolutePathInCode(everythingResult.absolutePath);
	} else if (isAbsolutePathUserIgnored(app, everythingResult.absolutePath)) {
		return await openAbsolutePathInCode(everythingResult.absolutePath);
	} else await electron.shell.openPath(everythingResult.absolutePath);
	return { close: true };
}

export function notifyActionError(message: string): void {
	new Notice(message);
}
