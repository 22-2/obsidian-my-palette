import { Notice, TFile, type App } from "obsidian";
import { promises as fs } from "fs";
import { spawn } from "child_process";
import * as path from "path";
import {
	getVaultFullPath,
	getVaultRootPath,
	isAbsolutePathUserIgnored,
	isUserIgnoredPath,
} from "../core/ignoredPaths";

declare const electron: {
	shell: {
		showItemInFolder: (path: string) => void;
		openPath: (path: string) => Promise<string>;
		openExternal: (url: string) => Promise<void>;
	};
};
import type { EverythingResult, PaletteResult } from "../model/results";
import { isMarkdownPath } from "../core/externalFiles";

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
	const vaultRoot = getVaultRootPath(app);
	if (!absolutePath)
		return { close: false, message: "This vault adapter cannot resolve an absolute path." };
	if (!vaultRoot)
		return { close: false, message: "This vault adapter cannot resolve the Vault folder." };
	return await openAbsolutePathInCode(vaultRoot, absolutePath);
}

async function findCodeExecutable(): Promise<string | null> {
	const candidates = [
		process.env.VSCODE_EXEC_PATH,
		process.env.LOCALAPPDATA &&
			path.win32.join(process.env.LOCALAPPDATA, "Programs", "Microsoft VS Code", "Code.exe"),
		process.env.LOCALAPPDATA &&
			path.win32.join(
				process.env.LOCALAPPDATA,
				"Programs",
				"Microsoft VS Code Insiders",
				"Code - Insiders.exe",
			),
		process.env.ProgramFiles &&
			path.win32.join(process.env.ProgramFiles, "Microsoft VS Code", "Code.exe"),
		process.env["ProgramFiles(x86)"] &&
			path.win32.join(process.env["ProgramFiles(x86)"], "Microsoft VS Code", "Code.exe"),
		...(process.env.PATH ?? "")
			.split(path.win32.delimiter)
			.flatMap((directory) => [
				path.win32.join(directory, "Code.exe"),
				path.win32.join(directory, "..", "Code.exe"),
			]),
	].filter((candidate): candidate is string => Boolean(candidate));

	for (const candidate of candidates) {
		try {
			const resolved = path.win32.resolve(candidate);
			const stat = await fs.stat(resolved);
			if (stat.isFile()) return resolved;
		} catch {
			// Try the next known VS Code installation path.
		}
	}
	return null;
}

async function openAbsolutePathInCode(
	vaultRoot: string,
	absolutePath: string,
): Promise<ActionOutcome> {
	const executable = await findCodeExecutable();
	if (!executable) return { close: false, message: "Could not find VS Code (Code.exe)." };
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(executable, ["--new-window", vaultRoot, absolutePath], {
				detached: true,
				stdio: "ignore",
				windowsHide: true,
			});
			child.once("error", reject);
			child.once("spawn", () => {
				child.unref();
				resolve();
			});
		});
		return { close: true };
	} catch {
		return { close: false, message: "Could not open the file in VS Code." };
	}
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
		await fs.stat(everythingResult.absolutePath);
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
				const vaultRoot = getVaultRootPath(app);
				if (!vaultRoot)
					return {
						close: false,
						message: "This vault adapter cannot resolve the Vault folder.",
					};
				return await openAbsolutePathInCode(vaultRoot, everythingResult.absolutePath);
			}
			const vaultRoot = getVaultRootPath(app);
			if (!vaultRoot)
				return {
					close: false,
					message: "This vault adapter cannot resolve the Vault folder.",
				};
			return await openAbsolutePathInCode(vaultRoot, everythingResult.absolutePath);
		}
	} else if (isMarkdownPath(everythingResult.absolutePath)) {
		if (externalMarkdown.openExternalMarkdownInObsidian) {
			await externalMarkdown.openExternalMarkdown(everythingResult.absolutePath, action);
			return { close: true };
		}
		const vaultRoot = getVaultRootPath(app);
		if (!vaultRoot)
			return { close: false, message: "This vault adapter cannot resolve the Vault folder." };
		return await openAbsolutePathInCode(vaultRoot, everythingResult.absolutePath);
	} else if (isAbsolutePathUserIgnored(app, everythingResult.absolutePath)) {
		const vaultRoot = getVaultRootPath(app);
		if (!vaultRoot)
			return { close: false, message: "This vault adapter cannot resolve the Vault folder." };
		return await openAbsolutePathInCode(vaultRoot, everythingResult.absolutePath);
	} else await electron.shell.openPath(everythingResult.absolutePath);
	return { close: true };
}

export function notifyActionError(message: string): void {
	new Notice(message);
}
