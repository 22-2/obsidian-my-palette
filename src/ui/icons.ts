import type { IconName } from "obsidian";

/**
 * Lucide icon names for every action and kind the plugin draws.
 * Entries are named after what they mean, not how they look, so one action keeps one icon
 * across menus, buttons and result rows. Add an entry here instead of writing an icon name inline.
 */
export const ICONS = {
	// Opening a result
	open: "external-link",
	openInMainWindow: "app-window",
	openInBackground: "panel-top-open",
	openSideBySide: "separator-vertical",
	openBelow: "separator-horizontal",
	openInExternalEditor: "code",
	showInSystemExplorer: "folder-open",
	openInTerminal: "terminal",
	revealInFileExplorer: "folder-open",
	openSettings: "settings",
	openNewPalette: "plus",
	moveToSidebar: "panel-right",

	// Running and confirming
	run: "play",
	confirm: "corner-down-left",

	// Editing
	add: "plus",
	edit: "pencil",
	rename: "pencil-line",
	reset: "rotate-ccw",
	delete: "trash-2",
	copy: "copy",
	move: "folder-input",
	editProperties: "text-cursor-input",
	addTags: "tags",
	insertIntoMoc: "list-plus",
	mutualLinks: "arrow-left-right",
	regex: "regex",
	matchCase: "case-sensitive",
	replaceAll: "replace-all",
	addBookmark: "bookmark-plus",
	removeBookmark: "bookmark-minus",
	newBookmarkGroup: "folder-plus",

	// Tabs
	focusTab: "arrow-right-to-line",
	duplicateTab: "copy-plus",
	pin: "pin",
	unpin: "pin-off",
	close: "x",

	// Selection
	selection: "list-checks",
	checked: "square-check",
	unchecked: "square",
	check: "check",

	// Palette controls
	search: "search",
	history: "history",
	options: "settings-2",
	highlight: "highlighter",
	includeExcluded: "eye",
	help: "help-circle",
	info: "info",
	expand: "chevron-right",

	// Status
	ready: "arrow-right",
	warning: "alert-triangle",
	error: "alert-circle",

	// Kinds of result
	file: "file",
	note: "file-text",
	files: "files",
	folder: "folder",
	vaultRoot: "folder-root",
	command: "square-terminal",
	outgoingLinks: "links-going-out",
	backlinks: "links-coming-in",
	bookmark: "bookmark",
	smartConnections: "sparkles",
	tab: "panel-top",
	plugin: "puzzle",
	snippet: "paintbrush",
	vaultAudit: "scan-search",
	orphanedFile: "file-question",
	brokenLink: "unlink",
	emptyFolder: "folder-x",

	// Kinds of property value
	text: "text",
	list: "list",
	number: "binary",
	checkbox: "square-check",
	date: "calendar",
	datetime: "clock",
	tags: "tags",
	locked: "lock",
} as const satisfies Record<string, IconName>;

/** The icon for a file in a result row: notes get the note icon, other files the plain one. */
export function fileIcon(extension: string): IconName {
	return extension === "md" ? ICONS.note : ICONS.file;
}
