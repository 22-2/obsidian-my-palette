import type { TFile } from "obsidian";
import type { PaletteModeId } from "src/palette/modes";
import type { SearchHistoryEntry } from "src/settings/model";
import type { SettingsPageName } from "src/settings/settingsNavigation";

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
	| "property";
export type EverythingScope = "vault" | "directory";

export interface ParsedInput {
	raw: string;
	mode: PaletteMode;
	query: string;
	everythingScope?: EverythingScope;
}

/** File search and Everything can include files hidden by Obsidian. */
export function supportsIncludeIgnored(mode: PaletteMode): boolean {
	return mode === "file" || mode === "everything";
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

/** A Home row that opens one settings page without searching or opening a file. */
export interface SettingsEntryResult extends Omit<BaseResult, "mode"> {
	mode: "settings-entry";
	pageName: SettingsPageName;
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
	kind: PropertyKind;
	section: "This note" | "Reserved" | "Vault";
	/** Whether the current note has this key; a reserved key may be listed without it. */
	inNote: boolean;
	/** The note the list was built from; edits go to this note, not the active one. */
	sourcePath: string;
}

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
	| ModeEntryResult
	| SettingsEntryResult;

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
		case "search-history":
		case "mode-entry":
		case "settings-entry":
			return undefined;
	}
}
