import type { IconName } from "obsidian";
import { ICONS } from "src/ui/icons";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { t } from "src/i18n";

/** メニューの項目が、1つの操作ごとに表示するタイトルとアイコン。 */
export interface MenuAction {
	readonly title: string;
	readonly icon: IconName;
	/** 日本語 UI でも操作を検索できる、安定した英語 ID。 */
	readonly id?: string;
}

/**
 * 複数のメニューに現れる項目、または別の項目と同じ操作を指す項目。タイトルとアイコンを一緒に持つので、
 * どこに出しても同じ名前と見た目になる。
 */
export const MENU_ACTIONS = {
	open: { title: t("menu.open"), icon: ICONS.open, id: "open" },
	openInMainWindow: {
		title: t("menu.openInMainWindow"),
		icon: ICONS.openInMainWindow,
		id: "open-in-main-window",
	},
	openInBackground: {
		title: t("menu.openInBackground"),
		icon: ICONS.openInBackground,
		id: "open-in-background",
	},
	openSideBySide: {
		title: t("menu.openSideBySide"),
		icon: ICONS.openSideBySide,
		id: "open-side-by-side",
	},
	openBelow: { title: t("menu.openBelow"), icon: ICONS.openBelow, id: "open-below" },
	openInExternalEditor: {
		title: t("menu.openInExternalEditor"),
		icon: ICONS.openInExternalEditor,
		id: "open-in-external-editor",
	},
	showInSystemExplorer: {
		title: t("menu.revealInSystemExplorer"),
		icon: ICONS.showInSystemExplorer,
		id: "show-in-system-explorer",
	},
	openInTerminal: {
		title: t("menu.openInTerminal"),
		icon: ICONS.openInTerminal,
		id: "open-in-terminal",
	},
	openPluginSettings: {
		title: t("menu.openPluginSettings"),
		icon: ICONS.openSettings,
		id: "open-plugin-settings",
	},

	copyFileName: { title: t("menu.copyFileName"), icon: ICONS.copy, id: "copy-file-name" },
	copyRelativePath: {
		title: t("menu.copyRelativePath"),
		icon: ICONS.copy,
		id: "copy-relative-path",
	},
	copyAbsolutePath: {
		title: t("menu.copyAbsolutePath"),
		icon: ICONS.copy,
		id: "copy-absolute-path",
	},
	copyFileNames: { title: t("menu.copyFileNames"), icon: ICONS.copy, id: "copy-file-names" },
	copyRelativePaths: {
		title: t("menu.copyRelativePaths"),
		icon: ICONS.copy,
		id: "copy-relative-paths",
	},
	copyAbsolutePaths: {
		title: t("menu.copyAbsolutePaths"),
		icon: ICONS.copy,
		id: "copy-absolute-paths",
	},

	moveToFolder: { title: t("menu.moveToFolder"), icon: ICONS.move, id: "move-to-folder" },
	rename: { title: t("menu.rename"), icon: ICONS.rename, id: "rename" },
	editProperties: {
		title: t("menu.editProperties"),
		icon: ICONS.editProperties,
		id: "edit-properties",
	},
	addTags: { title: t("menu.addTags"), icon: ICONS.addTags, id: "add-tags" },
	insertIntoMoc: {
		title: t("menu.insertIntoMoc"),
		icon: ICONS.insertIntoMoc,
		id: "insert-into-moc",
	},

	addToBookmarks: {
		title: t("menu.addToBookmarks"),
		icon: ICONS.addBookmark,
		id: "add-to-bookmarks",
	},
	renameBookmark: { title: t("menu.renameBookmark"), icon: ICONS.rename, id: "rename-bookmark" },
	moveToBookmarkGroup: {
		title: t("menu.moveToBookmarkGroup"),
		icon: ICONS.move,
		id: "move-to-bookmark-group",
	},
	removeFromBookmarks: {
		title: t("menu.removeFromBookmarks"),
		icon: ICONS.removeBookmark,
		id: "remove-from-bookmarks",
	},

	editProperty: { title: t("menu.editProperty"), icon: ICONS.edit, id: "edit-property" },
	openPropertyInSearch: {
		title: t("menu.openPropertyInSearch"),
		icon: ICONS.search,
		id: "open-property-in-search",
	},
	copyPropertyValue: {
		title: t("menu.copyPropertyValue"),
		icon: ICONS.copy,
		id: "copy-property-value",
	},
	copyPropertyName: {
		title: t("menu.copyPropertyName"),
		icon: ICONS.copy,
		id: "copy-property-name",
	},
	deleteProperty: { title: t("menu.deleteProperty"), icon: ICONS.delete, id: "delete-property" },

	focusTab: { title: t("menu.focusTab"), icon: ICONS.focusTab, id: "focus-tab" },
	duplicateTab: { title: t("menu.duplicateTab"), icon: ICONS.duplicateTab, id: "duplicate-tab" },

	runCommand: { title: t("menu.runCommand"), icon: ICONS.run, id: "run-command" },
	enterMode: { title: t("menu.enterMode"), icon: ICONS.confirm, id: "enter-mode" },
	useSearch: { title: t("menu.useSearch"), icon: ICONS.history, id: "use-search" },
	clearChanges: { title: t("menu.clearChanges"), icon: ICONS.unchecked, id: "clear-changes" },

	highlightSearchMatches: {
		title: t("menu.highlightSearchMatches"),
		icon: ICONS.highlight,
		id: "highlight-search-matches",
	},
	foldKana: {
		title: t("menu.foldKana"),
		icon: ICONS.kana,
		id: "fold-kana",
	},
	openableFilesOnly: {
		title: t("menu.openableFilesOnly"),
		icon: ICONS.openableFilesOnly,
		id: "openable-files-only",
	},
	moveToRightSidebar: {
		title: t("menu.moveToRightSidebar"),
		icon: ICONS.moveToSidebar,
		id: "move-to-right-sidebar",
	},
	help: { title: t("menu.help"), icon: ICONS.help, id: "help" },
} as const satisfies Record<string, MenuAction>;

interface MenuItemLike<T> {
	setTitle(title: string): T;
	setIcon(icon: IconName | null): T;
}

/** 1つの操作から、項目のタイトルとアイコンを設定する。PaletteMenu と Obsidian の Menu の両方で使う。 */
export function withAction<T extends MenuItemLike<T>>(item: T, action: MenuAction): T {
	item.setTitle(action.title).setIcon(action.icon);
	if (action.id && "setSearchTerms" in item)
		(item as T & { setSearchTerms: (...terms: string[]) => T }).setSearchTerms(action.id);
	return item;
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
