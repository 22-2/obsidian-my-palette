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
	| "tag"
	| "audit";
export type EverythingScope = "vault" | "directory";

export interface ParsedInput {
	raw: string;
	mode: PaletteMode;
	query: string;
	everythingScope?: EverythingScope;
}

/** ファイル検索と Everything は、Obsidian が隠しているファイルを含められる。 */
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
	/** この結果が、明示的な「除外されたノート」の検索範囲から来たなら true。 */
	ignored?: boolean;
	/** 現在のクエリに一致したタグ。クエリが空の結果では省略する。 */
	matchedTags?: string[];
	/** 現在のクエリに一致したキーワード。空のクエリとタグだけのクエリでは省略する。 */
	matchedKeywords?: string[];
	/** 検索のスナップショットには、Obsidian の TFile を持たない除外ファイルも含む。 */
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

/** 関連するノートの代表的な発リンクまたは被リンクの出現箇所。 */
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
	/** ブックマークプラグイン自身の項目。操作で名前の変更・移動・削除ができるように持つ。 */
	entry?: BookmarkEntry;
}

export interface SmartConnectionResult extends BaseResult {
	mode: "smart";
	file: TFile;
	score: number;
}

/** 何も開かず、モードに入る Home の行。 */
export interface ModeEntryResult extends Omit<BaseResult, "mode"> {
	mode: "mode-entry";
	modeId: PaletteModeId;
	alias: string;
}

/** 開いているメイン領域のタブ。選ぶとファイルを開かず、そのタブを有効にする。 */
export interface TabResult extends BaseResult {
	mode: "tab";
	file?: TFile;
}

/** インストール済みのコミュニティプラグイン。選ぶと、そのフォルダーを外部エディターで開く。 */
export interface PluginResult extends BaseResult {
	mode: "plugin";
	pluginId: string;
	absolutePath: string;
	vaultPath: string;
	enabled: boolean;
	hasSettings: boolean;
}

/** CSS スニペットのファイル、またはスニペットのフォルダー。選ぶと、そのパスを外部で開く。 */
export interface SnippetResult extends BaseResult {
	mode: "snippet";
	snippetName: string;
	absolutePath: string;
	vaultPath: string;
	isFolder: boolean;
	enabled: boolean;
}

/** タグの一覧の行。選ぶと、そのタグの一括変更を開く。 */
export interface TagResult extends BaseResult {
	mode: "tag";
	tagName: string;
	count: number;
}

/** プロパティの行が編集できる値の種類。`unsupported` の値はソースモードで編集する。 */
export type PropertyKind =
	| "text"
	| "list"
	| "number"
	| "checkbox"
	| "date"
	| "datetime"
	| "tags"
	| "unsupported";

/** 現在のノートにあるプロパティのキー、またはノートが持たない Vault のキー。 */
export interface PropertyResult extends BaseResult {
	mode: "property";
	key: string;
	/** `new` は、どの候補にも一致しないキーを追加する行。選ぶと、まず種類を選ぶ。 */
	kind: PropertyKind | "new";
	section: "このノート" | "これらのノート" | "予約済み" | "Vault" | "新規";
	/** 現在のノートがこのキーを持つかどうか。予約済みのキーは、持っていなくても一覧に出ることがある。 */
	inNote: boolean;
	/** 一覧を作ったノート。編集はアクティブなノートではなく、このノートに行う。 */
	sourcePath: string;
	/** 一覧が複数のノートにまたがるとき、作った元のノートすべて。編集はそれらすべてに行う。 */
	sourcePaths?: readonly string[];
}

/** プロパティの行が編集するノート。複数ノートの一覧ならすべて、そうでなければ元のノート1つだけ。 */
export function propertyTargetPaths(result: PropertyResult): readonly string[] {
	return result.sourcePaths ?? [result.sourcePath];
}

interface AuditResultBase extends BaseResult {
	mode: "audit";
}

/** Vault 監査の、浮いたファイルまたは空のファイル。 */
export interface AuditFileResult extends AuditResultBase {
	kind: "orphaned-files" | "empty-files";
	file: TFile;
	size: number;
	/** 空のファイルだけ: MOC の節だけを持つノート。 */
	mocOnly?: true;
}

/** 存在しないリンク先と、それにリンクしているすべてのノート。 */
export interface AuditBrokenLinkResult extends AuditResultBase {
	kind: "broken-links";
	link: string;
	sources: readonly BrokenLinkSource[];
}

/** 空のフォルダーの木のうち、最上位のフォルダー。 */
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
	| TagResult
	| AuditResult
	| ModeEntryResult;

/**
 * 結果を選ぶ(Enter、ダブルクリック)と、プラグインやスニペットの行は外部エディターではなく
 * メニューを開く。そうした行には同じくらい有力な操作がいくつもある(エディター、エクスプローラー、
 * ターミナル、プラグインの設定)ので、既定の操作はどれにもしない。
 */
export function choosingOpensMenu(result: PaletteResult): boolean {
	return result.mode === "plugin" || result.mode === "snippet";
}

/** 結果が開くボールトのファイル。持つ場合だけ返す。ファイルの利用履歴の記録に使う。 */
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
