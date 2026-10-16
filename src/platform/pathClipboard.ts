import { Notice } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction, type MenuAction } from "src/ui/menuActions";
import { logger } from "src/shared/logger";

export interface CopyablePaths {
	fileName?: string;
	relativePath?: string;
	absolutePath?: string;
}

/** Keeps path-copy menu labels and clipboard error handling identical across file lists. */
export function addCopyPathMenuItems(
	menu: PaletteMenu,
	paths: CopyablePaths,
	onCopy: (path: string) => void,
): void {
	if (!paths.fileName && !paths.relativePath && !paths.absolutePath) return;
	menu.addSeparator();
	if (paths.fileName) {
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.copyFileName).onClick(() => onCopy(paths.fileName!)),
		);
	}
	if (paths.relativePath) {
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.copyRelativePath).onClick(() =>
				onCopy(paths.relativePath!),
			),
		);
	}
	if (paths.absolutePath) {
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.copyAbsolutePath).onClick(() =>
				onCopy(paths.absolutePath!),
			),
		);
	}
}

/** Adds newline-delimited copy actions for the current visible selection. */
export function addCopyPathListMenuItems(
	menu: PaletteMenu,
	pathsList: readonly CopyablePaths[],
	onCopy: (values: string[]) => void,
): void {
	const fileNames = uniqueValues(pathsList.map(({ fileName }) => fileName));
	const relativePaths = uniqueValues(pathsList.map(({ relativePath }) => relativePath));
	const absolutePaths = uniqueValues(pathsList.map(({ absolutePath }) => absolutePath));
	if (!fileNames.length && !relativePaths.length && !absolutePaths.length) return;
	menu.addSeparator();
	addListItem(menu, MENU_ACTIONS.copyFileNames, fileNames, onCopy);
	addListItem(menu, MENU_ACTIONS.copyRelativePaths, relativePaths, onCopy);
	addListItem(menu, MENU_ACTIONS.copyAbsolutePaths, absolutePaths, onCopy);
}

export async function copyPathListToClipboard(values: readonly string[]): Promise<void> {
	try {
		await navigator.clipboard.writeText(values.join("\n"));
		new Notice(`${values.length} items copied.`);
	} catch (error) {
		logger.error("Failed to copy the selected items", error);
		new Notice("Could not copy the selected items.");
	}
}

export async function copyPathToClipboard(value: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		new Notice("Path copied.");
	} catch (error) {
		logger.error("Failed to copy the path", error);
		new Notice("Could not copy the path.");
	}
}

function addListItem(
	menu: PaletteMenu,
	action: MenuAction,
	values: string[],
	onCopy: (values: string[]) => void,
): void {
	if (!values.length) return;
	menu.addItem((item) => withAction(item, action).onClick(() => onCopy(values)));
}

function uniqueValues(values: readonly (string | undefined)[]): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
