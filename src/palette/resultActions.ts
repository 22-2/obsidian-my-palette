import { Notice, TFile, type App } from "obsidian";
import { promises as fs } from "fs";

declare const electron: {
	shell: {
		showItemInFolder: (path: string) => void;
		openPath: (path: string) => Promise<string>;
	};
};
import type { PaletteResult } from "../model/results";

export type ActionKind = "primary" | "alternate" | "tertiary";
export interface ActionOutcome {
	close: boolean;
	message?: string;
}

export async function runResultAction(
	app: App,
	result: PaletteResult,
	action: ActionKind,
): Promise<ActionOutcome> {
	if (result.mode === "file") {
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
	try {
		await fs.stat(result.absolutePath);
	} catch {
		return { close: false, message: "The selected path no longer exists." };
	}
	if (action === "tertiary") {
		const editor = app.workspace.activeEditor?.editor;
		if (!editor)
			return { close: false, message: "Open a Markdown editor before inserting a path." };
		editor.replaceSelection(result.absolutePath);
	} else if (action === "alternate") {
		if (result.kind === "folder") await electron.shell.openPath(result.absolutePath);
		else electron.shell.showItemInFolder(result.absolutePath);
	} else await electron.shell.openPath(result.absolutePath);
	return { close: true };
}

export function notifyActionError(message: string): void {
	new Notice(message);
}
