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

/** 外部アプリの操作はデスクトップでだけ動く。モバイルにはシステムのエクスプローラーも VS Code の URL もない。 */
export function isDesktopApp(): boolean {
	return Platform.isDesktopApp;
}

/**
 * 結果が外部のアプリに渡せるファイルシステムのパス。持っている場合だけ。
 * 結果のメニューが、開く操作を適用するかどうかを決めるために使う。
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

/** システムのエクスプローラーの操作のために、絶対パスがフォルダーを指すかどうか。 */
export function isFolderResult(result: PaletteResult): boolean {
	if (result.mode === "plugin") return true;
	if (result.mode === "snippet") return result.isFolder;
	if (result.mode === "audit") return result.kind === "empty-folders";
	return result.mode === "everything" && result.kind === "folder";
}

/**
 * ファイルまたはフォルダーを、設定された外部エディターで開く。当面は VS Code だけで、その URL ハンドラー経由。
 */
export async function openInExternalEditor(absolutePath: string): Promise<string | null> {
	return openPathInCode(absolutePath);
}

/** ファイルは親のフォルダーで表示し、フォルダーは開く。OS のファイルマネージャーを使う。 */
export function showInSystemExplorer(absolutePath: string, isFolder: boolean): void {
	if (isFolder) void openWithSystemApplication(absolutePath);
	else electron.shell.showItemInFolder(absolutePath);
}

/** パスを OS の既定のアプリで開く。 */
export async function openWithSystemApplication(absolutePath: string): Promise<void> {
	await electron.shell.openPath(absolutePath);
}
