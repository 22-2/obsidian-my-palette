import type { IconName } from "obsidian";
import { ICONS } from "src/core/icons";
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
	externalApps: { title: t("menu.externalApps"), icon: ICONS.externalApps, id: "external-apps" },

	copyPath: { title: t("menu.copyPath"), icon: ICONS.copyPath, id: "copy-path" },
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
	merge: { title: t("menu.merge"), icon: ICONS.merge, id: "merge-notes" },
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
	deleteNote: { title: t("noteDelete.menu.single"), icon: ICONS.delete, id: "delete-note" },
	deleteFile: { title: t("fileDelete.menu.single"), icon: ICONS.delete, id: "delete-file" },

	focusTab: { title: t("menu.focusTab"), icon: ICONS.focusTab, id: "focus-tab" },
	duplicateTab: { title: t("menu.duplicateTab"), icon: ICONS.duplicateTab, id: "duplicate-tab" },

	runCommand: { title: t("menu.runCommand"), icon: ICONS.run, id: "run-command" },
	enterMode: { title: t("menu.enterMode"), icon: ICONS.confirm, id: "enter-mode" },
	hideMode: { title: t("menu.hideMode"), icon: ICONS.hide, id: "hide-mode" },
	useSearch: { title: t("menu.useSearch"), icon: ICONS.history, id: "use-search" },
	searchTag: { title: t("menu.tag.search"), icon: ICONS.search, id: "tag-search" },
	insertTagIntoActiveNote: {
		title: t("menu.tag.insertIntoActiveNote"),
		icon: ICONS.addTags,
		id: "tag-insert-active-note",
	},
	renameTag: { title: t("menu.tag.rename"), icon: ICONS.rename, id: "tag-rename" },
	deleteTags: { title: t("menu.tag.delete"), icon: ICONS.delete, id: "tag-delete" },
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

/**
 * 右クリックメニューのアクセスキー。Chrome のメニューのように、頻繁に使う開く・コピーと、
 * 編集の入口になる操作(名前変更、プロパティ、タグ、MOC 挿入)と、ノート・ファイルの削除に付ける。
 * Why: 移動、統合など、取り消しにくい操作は、キー1打での誤操作を避けるため付けない。
 * ノート・ファイルの削除は、キーを押しても確認パレットが開くだけで、実行には Ctrl+Enter が要るので付ける。
 * 操作の id ごとに1つ決め、どのメニューでも同じ操作は同じキーにする。
 * 同じメニューで同じキーの項目が並ぶときは、押すたびに順番にカーソルが移る。
 * サブメニューを開く項目(外部アプリ、パスをコピー)にも付ける。開くだけで実行はしないので、誤操作の心配がない。
 * サブメニューの中の項目は、サブメニューが開いている間だけ、そのキーで実行できる。
 */
export const ACCESS_KEYS: Readonly<Record<string, string>> = {
	open: "O",
	"open-in-background": "B",
	"open-side-by-side": "S",
	"external-apps": "E",
	"copy-path": "C",
	"copy-file-name": "N",
	"copy-file-names": "N",
	"copy-relative-path": "P",
	"copy-relative-paths": "P",
	"copy-property-value": "V",
	"copy-property-name": "N",
	"open-property-in-search": "S",
	"edit-properties": "P",
	"edit-property": "P",
	"insert-into-moc": "I",
	"add-tags": "T",
	"delete-note": "D",
	"delete-file": "D",
	rename: "R",
	"rename-bookmark": "R",
	"tag-rename": "R",
	"tag-insert-active-note": "I",
	"focus-tab": "F",
	"run-command": "R",
	"use-search": "U",
	"tag-search": "S",
};

/** 1つの操作から、項目のタイトル、アイコン、アクセスキーを設定する。PaletteMenu と Obsidian の Menu の両方で使う。 */
export function withAction<T extends MenuItemLike<T>>(item: T, action: MenuAction): T {
	item.setTitle(action.title).setIcon(action.icon);
	if (action.id && "setSearchTerms" in item)
		(item as T & { setSearchTerms: (...terms: string[]) => T }).setSearchTerms(action.id);
	const accessKey = action.id ? ACCESS_KEYS[action.id] : undefined;
	if (accessKey && "setAccessKey" in item)
		(item as T & { setAccessKey: (key: string) => T }).setAccessKey(accessKey);
	return item;
}

/** 操作の項目を1つ加える。 */
export function addMenuAction(menu: PaletteMenu, action: MenuAction, onClick: () => void): void {
	menu.addItem((item) => withAction(item, action).onClick(onClick));
}

/** サブメニューを開く項目を1つ加え、そのサブメニューを返す。操作は返されたサブメニューへ加える。 */
export function addSubmenuAction(menu: PaletteMenu, action: MenuAction): PaletteMenu {
	let submenu: PaletteMenu | undefined;
	menu.addItem((item) => {
		submenu = withAction(item, action).setSubmenu();
	});
	// addItem はその場で build を呼ぶので、ここで必ず入っている。
	return submenu as PaletteMenu;
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

/**
 * ファイルやフォルダーを別のアプリに渡す操作。どこでも同じ順序にする。
 * 2つ以上あれば「外部アプリ」のサブメニューに畳み、外部エディターだけなら畳まずにそのまま出す。
 */
export function addExternalAppMenuItems(
	menu: PaletteMenu,
	handlers: ExternalAppMenuHandlers,
): void {
	const folds = Boolean(handlers.showInSystemExplorer || handlers.openInTerminal);
	const target = folds ? addSubmenuAction(menu, MENU_ACTIONS.externalApps) : menu;
	addMenuAction(target, MENU_ACTIONS.openInExternalEditor, handlers.openInExternalEditor);
	if (handlers.showInSystemExplorer)
		addMenuAction(target, MENU_ACTIONS.showInSystemExplorer, handlers.showInSystemExplorer);
	if (handlers.openInTerminal)
		addMenuAction(target, MENU_ACTIONS.openInTerminal, handlers.openInTerminal);
}
