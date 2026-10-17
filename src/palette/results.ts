import type { TFile } from "obsidian";
import type { BrokenLinkSource } from "src/audit/vaultAudit";
import type { PaletteModeId } from "src/palette/modes";
import type { BookmarkEntry } from "src/search/bookmark/bookmarks";
import type { SearchHistoryEntry } from "src/settings/model";

export type PaletteMode =
	| "file"
	| "command"
	| "everything"
	| "link"
	| "backlink"
	| "bookmark"
	| "smart"
	| "tab"
	| "plugin"
	| "snippet"
	| "property"
	| "audit";
export type EverythingScope = "vault" | "directory";

export interface ParsedInput {
	raw: string;
	mode: PaletteMode;
	query: string;
	everythingScope?: EverythingScope;
}

/** File search and Everything can include files hidden by Obsidian. */
export function supportsIncludeIgnored(mode: PaletteMode): boolean {
	return mode === "file" || mode === "everything" || mode === "audit";
}

export interface BaseResult {
	id: string;
	mode: PaletteMode;
	primary: string;
	secondary: string;
	icon: string;
}

export interface FileResult extends BaseResult {
	mode: "file";
	vaultPath: string;
	file?: TFile;
	/** True when this result came from the explicit ignored-note search scope. */
	ignored?: boolean;
	/** Tags matched by the current query; omitted for empty-query results. */
	matchedTags?: string[];
	/** Keywords matched by the current query; omitted for empty and tag-only queries. */
	matchedKeywords?: string[];
	/** Search snapshots also cover Obsidian-excluded files that have no Obsidian TFile. */
	mtime?: number;
	prior?: number;
}

export interface CommandResult extends BaseResult {
	mode: "command";
	commandId: string;
}

export interface EverythingResult extends BaseResult {
	mode: "everything";
	absolutePath: string;
	vaultPath?: string;
	scope: EverythingScope;
	kind: "file" | "folder";
	attributes: string;
}

export interface SearchHistoryResult extends Omit<BaseResult, "mode">, SearchHistoryEntry {
	mode: "search-history";
}

/** A representative outgoing link or backlink occurrence for a related note. */
export interface RelatedFileResult extends BaseResult {
	mode: "link" | "backlink";
	file: TFile;
	line: number;
}

export interface BookmarkResult extends BaseResult {
	mode: "bookmark";
	kind: "file" | "search";
	file?: TFile;
	query?: string;
	/** The Bookmarks plugin's own entry, so actions can rename, move or remove it. */
	entry?: BookmarkEntry;
}

export interface SmartConnectionResult extends BaseResult {
	mode: "smart";
	file: TFile;
	score: number;
}

/** A Home row that enters a mode instead of opening anything. */
export interface ModeEntryResult extends Omit<BaseResult, "mode"> {
	mode: "mode-entry";
	modeId: PaletteModeId;
	alias: string;
}

/** An open main-area tab; choosing it activates the tab instead of opening a file. */
export interface TabResult extends BaseResult {
	mode: "tab";
	file?: TFile;
}

/** An installed community plugin; choosing it opens its folder in an external editor. */
export interface PluginResult extends BaseResult {
	mode: "plugin";
	pluginId: string;
	absolutePath: string;
	vaultPath: string;
	enabled: boolean;
	hasSettings: boolean;
}

/** A CSS snippet file or the snippets folder; choosing it opens the path externally. */
export interface SnippetResult extends BaseResult {
	mode: "snippet";
	snippetName: string;
	absolutePath: string;
	vaultPath: string;
	isFolder: boolean;
	enabled: boolean;
}

/** The value kinds a property row can edit; `unsupported` values are edited in source mode. */
export type PropertyKind =
	| "text"
	| "list"
	| "number"
	| "checkbox"
	| "date"
	| "datetime"
	| "tags"
	| "unsupported";

/** A property key in the current note, or a key from the vault that the note does not have. */
export interface PropertyResult extends BaseResult {
	mode: "property";
	key: string;
	/** `new` is the row that adds a key nothing matches; choosing it picks a type first. */
	kind: PropertyKind | "new";
	section: "This note" | "These notes" | "Reserved" | "Vault" | "New";
	/** Whether the current note has this key; a reserved key may be listed without it. */
	inNote: boolean;
	/** The note the list was built from; edits go to this note, not the active one. */
	sourcePath: string;
	/** Every note the list was built from, when it spans several; edits go to all of them. */
	sourcePaths?: readonly string[];
}

/** The notes a property row edits: all of a multi-note list, or just its one source note. */
export function propertyTargetPaths(result: PropertyResult): readonly string[] {
	return result.sourcePaths ?? [result.sourcePath];
}

interface AuditResultBase extends BaseResult {
	mode: "audit";
}

/** An orphaned or empty file in Vault audit. */
export interface AuditFileResult extends AuditResultBase {
	kind: "orphaned-files" | "empty-files";
	file: TFile;
	size: number;
	/** Empty files only: a note holding nothing but its MOC section. */
	mocOnly?: true;
}

/** A link target that does not exist, with every note that links to it. */
export interface AuditBrokenLinkResult extends AuditResultBase {
	kind: "broken-links";
	link: string;
	sources: readonly BrokenLinkSource[];
}

/** The topmost folder of an empty folder tree. */
export interface AuditFolderResult extends AuditResultBase {
	kind: "empty-folders";
	folderPath: string;
	foldersInside: number;
}

export type AuditResult = AuditFileResult | AuditBrokenLinkResult | AuditFolderResult;

export type PaletteResult =
	| FileResult
	| CommandResult
	| EverythingResult
	| SearchHistoryResult
	| RelatedFileResult
	| BookmarkResult
	| SmartConnectionResult
	| TabResult
	| PluginResult
	| SnippetResult
	| PropertyResult
	| AuditResult
	| ModeEntryResult;

/**
 * Choosing (Enter, double-click) a plugin or snippet row opens its menu instead of the
 * external editor: such rows have several equally likely actions (editor, explorer,
 * terminal, plugin settings), so none is the default.
 */
export function choosingOpensMenu(result: PaletteResult): boolean {
	return result.mode === "plugin" || result.mode === "snippet";
}

/** The vault file a result opens, when it has one; used to record file usage. */
export function getResultFilePath(result: PaletteResult): string | undefined {
	switch (result.mode) {
		case "file":
			return result.vaultPath;
		case "everything":
			return result.kind === "file" ? result.vaultPath : undefined;
		case "bookmark":
		case "tab":
			return result.file?.path;
		case "link":
		case "backlink":
		case "smart":
			return result.file.path;
		case "command":
		case "plugin":
		case "snippet":
		case "property":
		case "audit":
		case "search-history":
		case "mode-entry":
			return undefined;
	}
}
