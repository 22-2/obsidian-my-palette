import { Platform, type App } from "obsidian";
import { getVaultFullPath } from "src/ignored-notes/ignoredPaths";
import type { PaletteResult } from "src/palette/results";
import { openPathInCode } from "src/platform/vscode";

declare const electron: {
	shell: {
		showItemInFolder: (path: string) => void;
		openPath: (path: string) => Promise<string>;
		openExternal: (url: string) => Promise<void>;
	};
};

/** External-app actions run only on desktop; mobile has no system explorer or VS Code URL. */
export function isDesktopApp(): boolean {
	return Platform.isDesktopApp;
}

/**
 * The filesystem path a result can hand to an external app, when it has one.
 * Used by the result menu to decide whether open actions apply.
 */
export function getResultAbsolutePath(app: App, result: PaletteResult): string | undefined {
	switch (result.mode) {
		case "file":
			return getVaultFullPath(app, result.vaultPath) ?? undefined;
		case "everything":
			return result.absolutePath;
		case "link":
		case "backlink":
		case "smart":
			return getVaultFullPath(app, result.file.path) ?? undefined;
		case "bookmark":
			return result.file ? (getVaultFullPath(app, result.file.path) ?? undefined) : undefined;
		case "tab":
			return result.file ? (getVaultFullPath(app, result.file.path) ?? undefined) : undefined;
		case "plugin":
		case "snippet":
			return result.absolutePath;
		case "audit":
			if (result.kind === "empty-folders")
				return getVaultFullPath(app, result.folderPath) ?? undefined;
			if (result.kind === "broken-links") return undefined;
			return getVaultFullPath(app, result.file.path) ?? undefined;
		case "command":
		case "property":
		case "search-history":
		case "mode-entry":
			return undefined;
	}
}

/** Whether the absolute path points to a folder, for the system explorer action. */
export function isFolderResult(result: PaletteResult): boolean {
	if (result.mode === "plugin") return true;
	if (result.mode === "snippet") return result.isFolder;
	if (result.mode === "audit") return result.kind === "empty-folders";
	return result.mode === "everything" && result.kind === "folder";
}

/**
 * Opens a file or folder in the configured external editor.
 * Initially VS Code only, via its URL handler.
 */
export async function openInExternalEditor(absolutePath: string): Promise<string | null> {
	return openPathInCode(absolutePath);
}

/** Reveals a file in its folder, or opens a folder, in the OS file manager. */
export function showInSystemExplorer(absolutePath: string, isFolder: boolean): void {
	if (isFolder) void openWithSystemApplication(absolutePath);
	else electron.shell.showItemInFolder(absolutePath);
}

/** Opens a path with its operating-system default application. */
export async function openWithSystemApplication(absolutePath: string): Promise<void> {
	await electron.shell.openPath(absolutePath);
}
