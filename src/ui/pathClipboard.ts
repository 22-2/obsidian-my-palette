import { Notice } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { addSubmenuAction, MENU_ACTIONS, withAction, type MenuAction } from "src/ui/menuActions";
import { logger } from "src/core/logger";
import { t } from "src/i18n";

export interface CopyablePaths {
	fileName?: string;
	relativePath?: string;
	absolutePath?: string;
}

/** メニューに出すコピーの操作1つ。畳むメニューと畳まないメニューで、同じ項目を出すために共有する。 */
interface CopyEntry {
	action: MenuAction;
	run: () => void;
}

function pathEntries(paths: CopyablePaths, onCopy: (path: string) => void): CopyEntry[] {
	const entries: CopyEntry[] = [];
	const { fileName, relativePath, absolutePath } = paths;
	if (fileName) entries.push({ action: MENU_ACTIONS.copyFileName, run: () => onCopy(fileName) });
	if (relativePath)
		entries.push({ action: MENU_ACTIONS.copyRelativePath, run: () => onCopy(relativePath) });
	if (absolutePath)
		entries.push({ action: MENU_ACTIONS.copyAbsolutePath, run: () => onCopy(absolutePath) });
	return entries;
}

function pathListEntries(
	pathsList: readonly CopyablePaths[],
	onCopy: (values: string[]) => void,
): CopyEntry[] {
	const lists: [MenuAction, string[]][] = [
		[MENU_ACTIONS.copyFileNames, uniqueValues(pathsList.map(({ fileName }) => fileName))],
		[
			MENU_ACTIONS.copyRelativePaths,
			uniqueValues(pathsList.map(({ relativePath }) => relativePath)),
		],
		[
			MENU_ACTIONS.copyAbsolutePaths,
			uniqueValues(pathsList.map(({ absolutePath }) => absolutePath)),
		],
	];
	return lists
		.filter(([, values]) => values.length > 0)
		.map(([action, values]) => ({ action, run: () => onCopy(values) }));
}

function addEntries(menu: PaletteMenu, entries: readonly CopyEntry[]): void {
	for (const { action, run } of entries)
		menu.addItem((item) => withAction(item, action).onClick(run));
}

/** 2つ以上なら「パスをコピー」のサブメニューに畳み、1つならそのまま出す。区切り線は引かない。 */
function addFoldedEntries(menu: PaletteMenu, entries: readonly CopyEntry[]): void {
	const target = entries.length > 1 ? addSubmenuAction(menu, MENU_ACTIONS.copyPath) : menu;
	addEntries(target, entries);
}

/** パスをコピーするメニューの項目と、クリップボードのエラーの扱いを、ファイルの一覧すべてで同じに保つ。 */
export function addCopyPathMenuItems(
	menu: PaletteMenu,
	paths: CopyablePaths,
	onCopy: (path: string) => void,
): void {
	const entries = pathEntries(paths, onCopy);
	if (!entries.length) return;
	menu.addSeparator();
	addEntries(menu, entries);
}

/** 現在表示されている選択について、改行で区切ったコピーの操作を加える。 */
export function addCopyPathListMenuItems(
	menu: PaletteMenu,
	pathsList: readonly CopyablePaths[],
	onCopy: (values: string[]) => void,
): void {
	const entries = pathListEntries(pathsList, onCopy);
	if (!entries.length) return;
	menu.addSeparator();
	addEntries(menu, entries);
}

/**
 * `addCopyPathMenuItems` の、サブメニューに畳む版。項目の多いメニューで使う。
 * 区切り線は引かないので、呼び出し側が、ほかの操作とのグループを決める。
 */
export function addCopyPathSubmenu(
	menu: PaletteMenu,
	paths: CopyablePaths,
	onCopy: (path: string) => void,
): void {
	addFoldedEntries(menu, pathEntries(paths, onCopy));
}

/** `addCopyPathListMenuItems` の、サブメニューに畳む版。区切り線は引かない。 */
export function addCopyPathListSubmenu(
	menu: PaletteMenu,
	pathsList: readonly CopyablePaths[],
	onCopy: (values: string[]) => void,
): void {
	addFoldedEntries(menu, pathListEntries(pathsList, onCopy));
}

export async function copyPathListToClipboard(values: readonly string[]): Promise<void> {
	try {
		await navigator.clipboard.writeText(values.join("\n"));
		new Notice(t("clipboard.copiedItems", { count: values.length }));
	} catch (error) {
		logger.error("Failed to copy the selected items", error);
		new Notice(t("clipboard.copyItemsFailed"));
	}
}

export async function copyPathToClipboard(value: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(value);
		new Notice(t("clipboard.copiedPath"));
	} catch (error) {
		logger.error("Failed to copy the path", error);
		new Notice(t("clipboard.copyPathFailed"));
	}
}

function uniqueValues(values: readonly (string | undefined)[]): string[] {
	return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
