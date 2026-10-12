import type { TFile } from "obsidian";
import type { PaletteModeId } from "src/palette/modes";
import type { SearchHistoryEntry } from "src/settings/model";

export type PaletteMode =
	| "file"
	| "command"
	| "everything"
	| "link"
	| "backlink"
	| "bookmark"
	| "smart"
	| "tab";
export type EverythingScope = "vault" | "directory";

export interface ParsedInput {
	raw: string;
	mode: PaletteMode;
	query: string;
	everythingScope?: EverythingScope;
}

/** Only File search reads the ignored-note index; other modes ignore the switch. */
export function supportsIncludeIgnored(mode: PaletteMode): boolean {
	return mode === "file";
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
	/** Search snapshots also cover ignored notes that have no Obsidian TFile. */
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

/** A Root Search row that enters a mode instead of opening anything. */
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

export type PaletteResult =
	| FileResult
	| CommandResult
	| EverythingResult
	| SearchHistoryResult
	| RelatedFileResult
	| BookmarkResult
	| SmartConnectionResult
	| TabResult
	| ModeEntryResult;

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
		case "search-history":
		case "mode-entry":
			return undefined;
	}
}
