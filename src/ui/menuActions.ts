import type { IconName } from "obsidian";
import { ICONS } from "src/ui/icons";
import type { PaletteMenu } from "src/ui/paletteMenu";

/** The title and icon a menu item shows for one action. */
export interface MenuAction {
	readonly title: string;
	readonly icon: IconName;
}

/**
 * Menu items that appear in more than one menu, or that name the same action as another item.
 * Keeping title and icon together means an action reads and looks the same wherever it is offered.
 */
export const MENU_ACTIONS = {
	open: { title: "Open", icon: ICONS.open },
	openInMainWindow: { title: "Open in main window", icon: ICONS.openInMainWindow },
	openInBackground: { title: "Open in new tab (background)", icon: ICONS.openInBackground },
	openSideBySide: { title: "Open side by side", icon: ICONS.openSideBySide },
	openBelow: { title: "Open below", icon: ICONS.openBelow },
	openInExternalEditor: { title: "Open in external editor", icon: ICONS.openInExternalEditor },
	showInSystemExplorer: { title: "Show in system explorer", icon: ICONS.showInSystemExplorer },
	openInTerminal: { title: "Open in terminal", icon: ICONS.openInTerminal },
	openPluginSettings: { title: "Open plugin settings", icon: ICONS.openSettings },

	copyFileName: { title: "Copy file name", icon: ICONS.copy },
	copyRelativePath: { title: "Copy path relative to vault", icon: ICONS.copy },
	copyAbsolutePath: { title: "Copy absolute path", icon: ICONS.copy },
	copyFileNames: { title: "Copy file names", icon: ICONS.copy },
	copyRelativePaths: { title: "Copy paths relative to vault", icon: ICONS.copy },
	copyAbsolutePaths: { title: "Copy absolute paths", icon: ICONS.copy },

	moveToFolder: { title: "Move to…", icon: ICONS.move },
	rename: { title: "Rename…", icon: ICONS.rename },
	editProperties: { title: "Edit properties…", icon: ICONS.editProperties },
	addTags: { title: "Add tags…", icon: ICONS.addTags },
	insertIntoMoc: { title: "Insert into MOC Relateds", icon: ICONS.insertIntoMoc },

	addToBookmarks: { title: "Add to bookmarks…", icon: ICONS.addBookmark },
	renameBookmark: { title: "Rename bookmark…", icon: ICONS.rename },
	moveToBookmarkGroup: { title: "Move to bookmark group…", icon: ICONS.move },
	removeFromBookmarks: { title: "Remove from bookmarks", icon: ICONS.removeBookmark },

	editProperty: { title: "Edit", icon: ICONS.edit },
	openPropertyInSearch: { title: "Open in search", icon: ICONS.search },
	copyPropertyValue: { title: "Copy value", icon: ICONS.copy },
	copyPropertyName: { title: "Copy property name", icon: ICONS.copy },
	deleteProperty: { title: "Delete property", icon: ICONS.delete },

	focusTab: { title: "Focus tab", icon: ICONS.focusTab },
	duplicateTab: { title: "Duplicate tab", icon: ICONS.duplicateTab },

	runCommand: { title: "Run command", icon: ICONS.run },
	enterMode: { title: "Enter mode", icon: ICONS.confirm },
	useSearch: { title: "Use search", icon: ICONS.history },
	clearChanges: { title: "Clear changes", icon: ICONS.unchecked },

	highlightSearchMatches: { title: "Highlight search matches", icon: ICONS.highlight },
	moveToRightSidebar: { title: "Move to right sidebar", icon: ICONS.moveToSidebar },
	help: { title: "Help", icon: ICONS.help },
} as const satisfies Record<string, MenuAction>;

interface MenuItemLike<T> {
	setTitle(title: string): T;
	setIcon(icon: IconName | null): T;
}

/** Sets an item's title and icon from one action, for both PaletteMenu and Obsidian's Menu. */
export function withAction<T extends MenuItemLike<T>>(item: T, action: MenuAction): T {
	return item.setTitle(action.title).setIcon(action.icon);
}

/** Adds one item for an action. */
export function addMenuAction(menu: PaletteMenu, action: MenuAction, onClick: () => void): void {
	menu.addItem((item) => withAction(item, action).onClick(onClick));
}

export interface OpenMenuHandlers {
	open: () => void;
	/** Only popout hosts offer this; leave it out elsewhere. */
	openInMainWindow?: () => void;
	openInBackground: () => void;
	openSideBySide: () => void;
	openBelow: () => void;
}

/** The ways to open a note, in the same order in every menu that lists them. */
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
	/** Left out when the item has no absolute path on this device. */
	showInSystemExplorer?: () => void;
	openInTerminal?: () => void;
}

/** The actions that hand a file or folder to another app, in the same order everywhere. */
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
