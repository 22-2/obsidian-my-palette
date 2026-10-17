import type { IconName } from "obsidian";
import { ICONS } from "src/ui/icons";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { t } from "src/i18n";

/** メニューの項目が、1つの操作ごとに表示するタイトルとアイコン。 */
export interface MenuAction {
	readonly title: string;
	readonly icon: IconName;
}

/**
 * 複数のメニューに現れる項目、または別の項目と同じ操作を指す項目。タイトルとアイコンを一緒に持つので、
 * どこに出しても同じ名前と見た目になる。
 */
export const MENU_ACTIONS = {
	open: { title: t("menu.open"), icon: ICONS.open },
	openInMainWindow: { title: t("menu.openInMainWindow"), icon: ICONS.openInMainWindow },
	openInBackground: { title: t("menu.openInBackground"), icon: ICONS.openInBackground },
	openSideBySide: { title: t("menu.openSideBySide"), icon: ICONS.openSideBySide },
	openBelow: { title: t("menu.openBelow"), icon: ICONS.openBelow },
	openInExternalEditor: {
		title: t("menu.openInExternalEditor"),
		icon: ICONS.openInExternalEditor,
	},
	showInSystemExplorer: {
		title: t("menu.revealInSystemExplorer"),
		icon: ICONS.showInSystemExplorer,
	},
	openInTerminal: { title: t("menu.openInTerminal"), icon: ICONS.openInTerminal },
	openPluginSettings: { title: t("menu.openPluginSettings"), icon: ICONS.openSettings },

	copyFileName: { title: t("menu.copyFileName"), icon: ICONS.copy },
	copyRelativePath: { title: t("menu.copyRelativePath"), icon: ICONS.copy },
	copyAbsolutePath: { title: t("menu.copyAbsolutePath"), icon: ICONS.copy },
	copyFileNames: { title: t("menu.copyFileNames"), icon: ICONS.copy },
	copyRelativePaths: { title: t("menu.copyRelativePaths"), icon: ICONS.copy },
	copyAbsolutePaths: { title: t("menu.copyAbsolutePaths"), icon: ICONS.copy },

	moveToFolder: { title: t("menu.moveToFolder"), icon: ICONS.move },
	rename: { title: t("menu.rename"), icon: ICONS.rename },
	editProperties: { title: t("menu.editProperties"), icon: ICONS.editProperties },
	addTags: { title: t("menu.addTags"), icon: ICONS.addTags },
	insertIntoMoc: { title: t("menu.insertIntoMoc"), icon: ICONS.insertIntoMoc },

	addToBookmarks: { title: t("menu.addToBookmarks"), icon: ICONS.addBookmark },
	renameBookmark: { title: t("menu.renameBookmark"), icon: ICONS.rename },
	moveToBookmarkGroup: { title: t("menu.moveToBookmarkGroup"), icon: ICONS.move },
	removeFromBookmarks: { title: t("menu.removeFromBookmarks"), icon: ICONS.removeBookmark },

	editProperty: { title: t("menu.editProperty"), icon: ICONS.edit },
	openPropertyInSearch: { title: t("menu.openPropertyInSearch"), icon: ICONS.search },
	copyPropertyValue: { title: t("menu.copyPropertyValue"), icon: ICONS.copy },
	copyPropertyName: { title: t("menu.copyPropertyName"), icon: ICONS.copy },
	deleteProperty: { title: t("menu.deleteProperty"), icon: ICONS.delete },

	focusTab: { title: t("menu.focusTab"), icon: ICONS.focusTab },
	duplicateTab: { title: t("menu.duplicateTab"), icon: ICONS.duplicateTab },

	runCommand: { title: t("menu.runCommand"), icon: ICONS.run },
	enterMode: { title: t("menu.enterMode"), icon: ICONS.confirm },
	useSearch: { title: t("menu.useSearch"), icon: ICONS.history },
	clearChanges: { title: t("menu.clearChanges"), icon: ICONS.unchecked },

	highlightSearchMatches: { title: t("menu.highlightSearchMatches"), icon: ICONS.highlight },
	moveToRightSidebar: { title: t("menu.moveToRightSidebar"), icon: ICONS.moveToSidebar },
	help: { title: t("menu.help"), icon: ICONS.help },
} as const satisfies Record<string, MenuAction>;

interface MenuItemLike<T> {
	setTitle(title: string): T;
	setIcon(icon: IconName | null): T;
}

/** 1つの操作から、項目のタイトルとアイコンを設定する。PaletteMenu と Obsidian の Menu の両方で使う。 */
export function withAction<T extends MenuItemLike<T>>(item: T, action: MenuAction): T {
	return item.setTitle(action.title).setIcon(action.icon);
}

/** 操作の項目を1つ加える。 */
export function addMenuAction(menu: PaletteMenu, action: MenuAction, onClick: () => void): void {
	menu.addItem((item) => withAction(item, action).onClick(onClick));
}

export interface OpenMenuHandlers {
	open: () => void;
	/** ポップアウトのホストだけが出す。ほかでは省く。 */
	openInMainWindow?: () => void;
	openInBackground: () => void;
	openSideBySide: () => void;
	openBelow: () => void;
}

/** ノートを開く方法。それらを並べるすべてのメニューで、同じ順序にする。 */
export function addOpenMenuItems(menu: PaletteMenu, handlers: OpenMenuHandlers): void {
	addMenuAction(menu, MENU_ACTIONS.open, handlers.open);
	if (handlers.openInMainWindow)
		addMenuAction(menu, MENU_ACTIONS.openInMainWindow, handlers.openInMainWindow);
	addMenuAction(menu, MENU_ACTIONS.openInBackground, handlers.openInBackground);
	addMenuAction(menu, MENU_ACTIONS.openSideBySide, handlers.openSideBySide);
	addMenuAction(menu, MENU_ACTIONS.openBelow, handlers.openBelow);
}

export interface ExternalAppMenuHandlers {
	openInExternalEditor: () => void;
	/** この端末で絶対パスがない項目では省く。 */
	showInSystemExplorer?: () => void;
	openInTerminal?: () => void;
}

/** ファイルやフォルダーを別のアプリに渡す操作。どこでも同じ順序にする。 */
export function addExternalAppMenuItems(
	menu: PaletteMenu,
	handlers: ExternalAppMenuHandlers,
): void {
	addMenuAction(menu, MENU_ACTIONS.openInExternalEditor, handlers.openInExternalEditor);
	if (handlers.showInSystemExplorer)
		addMenuAction(menu, MENU_ACTIONS.showInSystemExplorer, handlers.showInSystemExplorer);
	if (handlers.openInTerminal)
		addMenuAction(menu, MENU_ACTIONS.openInTerminal, handlers.openInTerminal);
}
