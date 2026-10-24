import type { IconName } from "obsidian";

/**
 * プラグインが描くすべての操作と種類の Lucide アイコン名。
 * 項目は見た目ではなく意味で名付けるので、1つの操作はメニュー、ボタン、結果の行をまたいで同じアイコンを保つ。
 * アイコン名を直接書かず、ここに項目を追加すること。
 */
export const ICONS = {
	// 結果を開く
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
	hide: "eye-off",
	openNewPalette: "plus",
	moveToSidebar: "panel-right",

	// 実行と確認
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
	merge: "git-merge",
	editProperties: "text-cursor-input",
	addTags: "tags",
	insertIntoMoc: "list-plus",
	mutualLinks: "arrow-left-right",
	regex: "regex",
	matchCase: "case-sensitive",
	kana: "languages",
	openableFilesOnly: "file-x",
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

	// パレットの操作
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

	// 結果の種類
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
	tagMode: "hash",
	vaultAudit: "scan-search",
	orphanedFile: "file-question",
	brokenLink: "unlink",
	emptyFolder: "folder-x",

	// プロパティ値の種類
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
