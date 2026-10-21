import type { AuditKind } from "src/audit/vaultAudit";
import type { PaletteModeId } from "src/palette/modes";
import { DEFAULT_HOTKEYS, type PaletteHotkeys } from "src/ui/hotkeys";

export interface SearchHistoryEntry {
	input: string;
	category: SearchHistoryCategory;
	includeIgnored?: boolean;
	lastSearchedAt: number;
	count: number;
}

export type SelectorHistoryCategory =
	| "tag-insertion"
	| "moc-insertion"
	| "folder-move"
	| "bulk-rename"
	| "merge-target"
	| "property-value";

export type SearchHistoryCategory =
	| SelectorHistoryCategory
	| "file"
	| "command"
	| "bookmark"
	| "smart"
	| "tab"
	| "plugin"
	| "snippet"
	| "property"
	| "audit"
	| "everything"
	| "everything-directory"
	| "link"
	| "backlink";

export interface SearchHistorySettings {
	enabled: boolean;
	addDelayMs: number;
	daysToKeep: number;
}

export const SETTINGS_SCHEMA_VERSION = 23;

/** パレットを閉じてから、「ホームを開く」が Home から始め直すまでの秒数。0 なら即座に。 */
export type ReturnToHomeSeconds = 0 | 30 | 60 | 90;
export const MAX_RECENT_COMMAND_IDS = 20;
export const MILLISECONDS_PER_SECOND = 1_000;
export const DISABLED_DELAY_MS = 0;
export const UNLIMITED_DAYS = 0;

/**
 * 保存される既定値を1つの名前付きブロックに置く。既定値が変わったときに、検証と設定 UI が
 * 黙って食い違わないようにするため。
 */
export const SETTING_DEFAULTS = {
	searchHistory: {
		// 検索履歴は、ユーザーが完了させた操作を反映するときに最も役立つ。そのため、
		// 入力を止めて保存するのは既定ではなく、ユーザーが選ぶものにする。
		addDelayMs: 0,
		daysToKeep: UNLIMITED_DAYS,
	},
	everything: {
		maxResults: 100,
		debounceMs: 150,
		requestTimeoutMs: 30_000,
	},
} as const;

/**
 * 同じ範囲が、データの整形とスライダーの両方を動かす。対話的な編集を、data.json から
 * 読み込んだ値と一貫させるため。
 */
export const SETTING_LIMITS = {
	searchHistory: {
		addDelayMs: { min: DISABLED_DELAY_MS, max: 10_000, step: 1_000 },
		daysToKeep: { min: UNLIMITED_DAYS, max: 3_650, step: 30 },
	},
	everything: {
		maxResults: { min: 10, max: 500, step: 10 },
		debounceMs: { min: 50, max: 1_000, step: 50 },
		requestTimeoutMs: { min: 1_000, max: 60_000, step: 1_000 },
	},
} as const;

/**
 * これらの文字列は data.json に保存されるので、名前は安定した設定のトークンであり、ドキュメントに
 * 出るラベルでもある。ここに集約しておくと、並べ替えの分岐と移行が食い違わない。
 * 表示名は ja.json の sort.label.* で与える。
 */
export const FILE_SORT_PRIORITIES = {
	filenamePrefixMatch: "Filename prefix match",
	aliasPrefixMatch: "Alias prefix match",
	filenameFuzzyMatch: "Filename fuzzy match",
	aliasFuzzyMatch: "Alias fuzzy match",
	tagMatch: "Tag match",
	matchCoverage: "Match coverage",
	folderPathMatch: "Folder path match",
	lowerPriorFolders: "Lower prior folders",
	activity: "Activity",
	lastModified: "Last modified",
	aliasesCount: "Aliases count",
	alphabetical: "Alphabetical",
	alphabeticalReverse: "Alphabetical reverse",
	prior: "@prior",
	priorAsc: "@prior:asc",
	priorDesc: "@prior:desc",
} as const;

export const FILE_SORT_PRIORITY_LIST = [
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	FILE_SORT_PRIORITIES.tagMatch,
	FILE_SORT_PRIORITIES.matchCoverage,
	FILE_SORT_PRIORITIES.folderPathMatch,
	FILE_SORT_PRIORITIES.lowerPriorFolders,
	FILE_SORT_PRIORITIES.activity,
	FILE_SORT_PRIORITIES.lastModified,
	FILE_SORT_PRIORITIES.aliasesCount,
	FILE_SORT_PRIORITIES.alphabetical,
	FILE_SORT_PRIORITIES.alphabeticalReverse,
] as const;

export const FILE_SORT_PRIORITY_OPTIONS = [
	...FILE_SORT_PRIORITY_LIST,
	FILE_SORT_PRIORITIES.prior,
	FILE_SORT_PRIORITIES.priorAsc,
	FILE_SORT_PRIORITIES.priorDesc,
] as const;

export type FileSortPriority =
	| (typeof FILE_SORT_PRIORITY_LIST)[number]
	| typeof FILE_SORT_PRIORITIES.prior
	| typeof FILE_SORT_PRIORITIES.priorAsc
	| typeof FILE_SORT_PRIORITIES.priorDesc;

export type FileSortState = "blank" | "input";

export interface FileSortPriorities {
	blank: FileSortPriority[];
	input: FileSortPriority[];
}

const PRIOR_SORT_PRIORITY_PATTERN = /^@(prior)(?::(asc|desc))?$/;

export function parseFileSortPriority(
	value: string,
): { key: "prior"; order: "asc" | "desc" } | undefined {
	const match = value.match(PRIOR_SORT_PRIORITY_PATTERN);
	if (!match) return undefined;
	return { key: "prior", order: (match[2] as "asc" | "desc" | undefined) ?? "asc" };
}

export function isFileSortPriority(value: unknown): value is FileSortPriority {
	if (typeof value !== "string") return false;
	return (
		(FILE_SORT_PRIORITY_LIST as readonly string[]).includes(value) ||
		parseFileSortPriority(value) !== undefined
	);
}

const LEGACY_FILE_SORT_PRIORITY_ALIASES: Readonly<Record<string, FileSortPriority>> = {
	"Prefix name match": FILE_SORT_PRIORITIES.filenamePrefixMatch,
	"Fuzzy name match": FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	"Path fuzzy match": FILE_SORT_PRIORITIES.folderPathMatch,
	"Last opened": FILE_SORT_PRIORITIES.activity,
	"Usage history": FILE_SORT_PRIORITIES.activity,
};

const LEGACY_PATH_FUZZY_MATCH = "Path fuzzy match";
const LEGACY_LAST_OPENED = "Last opened";
const LEGACY_USAGE_HISTORY = "Usage history";

const LEGACY_DEFAULT_FILE_SORT_PRIORITIES = [
	"Prefix name match",
	"Fuzzy name match",
	FILE_SORT_PRIORITIES.priorDesc,
	LEGACY_LAST_OPENED,
	FILE_SORT_PRIORITIES.lastModified,
] as const;

const PRE_TAG_DEFAULT_FILE_SORT_PRIORITIES = [
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	LEGACY_PATH_FUZZY_MATCH,
	FILE_SORT_PRIORITIES.priorDesc,
	LEGACY_LAST_OPENED,
	FILE_SORT_PRIORITIES.lastModified,
] as const;

const PREVIOUS_DEFAULT_FILE_SORT_PRIORITIES = [
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	FILE_SORT_PRIORITIES.tagMatch,
	LEGACY_PATH_FUZZY_MATCH,
	FILE_SORT_PRIORITIES.priorDesc,
	LEGACY_LAST_OPENED,
	FILE_SORT_PRIORITIES.lastModified,
] as const;

const PREVIOUS_ACTIVITY_DEFAULT_FILE_SORT_PRIORITIES = [
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	FILE_SORT_PRIORITIES.tagMatch,
	FILE_SORT_PRIORITIES.matchCoverage,
	LEGACY_PATH_FUZZY_MATCH,
	FILE_SORT_PRIORITIES.priorDesc,
	LEGACY_LAST_OPENED,
	LEGACY_USAGE_HISTORY,
	FILE_SORT_PRIORITIES.lastModified,
] as const;

function isPriorityList(
	value: readonly (string | undefined)[],
	priorities: readonly string[],
): boolean {
	return (
		value.length === priorities.length &&
		value.every((item, index) => item === priorities[index])
	);
}

export function normalizeFileSortPriorities(
	value: unknown,
	fallback: readonly FileSortPriority[] = DEFAULT_FILE_SORT_PRIORITIES,
): FileSortPriority[] {
	if (!Array.isArray(value)) return [...fallback];
	const trimmed = value.map((item) => (typeof item === "string" ? item.trim() : undefined));
	// この設定の最初の版は、名前とエイリアスを合わせた優先度を出荷していた。手を加えていない既定値は
	// 移行し、既存のユーザーが分かれた挙動を受け取れるようにする。
	if (isPriorityList(trimmed, LEGACY_DEFAULT_FILE_SORT_PRIORITIES)) return [...fallback];
	// 新しい既定の優先度は、以前の一覧を変えていないユーザーに届くべき。一方で、任意の独自の順序は
	// 入力したとおりに残す。
	if (
		isPriorityList(trimmed, PRE_TAG_DEFAULT_FILE_SORT_PRIORITIES) ||
		isPriorityList(trimmed, PREVIOUS_DEFAULT_FILE_SORT_PRIORITIES) ||
		isPriorityList(trimmed, PREVIOUS_ACTIVITY_DEFAULT_FILE_SORT_PRIORITIES) ||
		isPriorityList(trimmed, [...DEFAULT_FILE_SORT_PRIORITIES])
	)
		return [...fallback];
	const normalized = trimmed.flatMap((item): FileSortPriority[] => {
		if (item === undefined) return [];
		const priority = LEGACY_FILE_SORT_PRIORITY_ALIASES[item] ?? item;
		return isFileSortPriority(priority) ? [priority] : [];
	});
	// 二段のリストは有効かどうかを表すので、同じトークンが繰り返すと意味が通らず、
	// 曖昧な重複行として現れてしまう。
	return [...new Set(normalized)];
}

// 既存の関連度と最近の順の挙動を保ちつつ、`prior` を既定で役立つものにする。同点の決め手として、
// また入力が空のときの最初の意味のある基準として使う。
export const DEFAULT_FILE_SORT_PRIORITIES: readonly FileSortPriority[] = [
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	FILE_SORT_PRIORITIES.tagMatch,
	FILE_SORT_PRIORITIES.matchCoverage,
	FILE_SORT_PRIORITIES.folderPathMatch,
	FILE_SORT_PRIORITIES.priorDesc,
	FILE_SORT_PRIORITIES.activity,
	FILE_SORT_PRIORITIES.lastModified,
];

// 空のクエリでは一致系の基準が除かれるため、有効な既定は Activity → Last modified →
// @prior:desc の順になる。ユーザーの実際の設定に合わせて、blank だけ別の既定にする。
export const DEFAULT_BLANK_FILE_SORT_PRIORITIES: readonly FileSortPriority[] = [
	FILE_SORT_PRIORITIES.activity,
	FILE_SORT_PRIORITIES.lastModified,
	FILE_SORT_PRIORITIES.priorDesc,
];

export type PaletteSurface = "table" | "view" | "palette";

export interface PaletteDisplaySettings {
	highlightSearchMatches: boolean;
}

export interface ModeSettings {
	alias: string;
	/** 無効なモードは Home から外れ、エイリアスでは入れない。 */
	enabled: boolean;
}

export type ModeSettingsMap = Record<PaletteModeId, ModeSettings>;

export interface IntegrationSettings {
	everything: { enabled: boolean };
	smartConnections: { enabled: boolean };
}

export interface MyPaletteSettings {
	integrations: IntegrationSettings;
	hotkeys: PaletteHotkeys;
	schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
	showLog: boolean;
	home: { returnAfterSeconds: ReturnToHomeSeconds };
	paletteDisplay: Record<PaletteSurface, PaletteDisplaySettings>;
	openExternalMarkdownInObsidian: boolean;
	/** タブで既に開いているノートを開くと、別のタブを開く代わりにそのタブへフォーカスする。 */
	focusExistingTab: boolean;
	searchHistory: SearchHistorySettings;
	modes: ModeSettingsMap;
	file: {
		sortPriorities: FileSortPriorities;
		excludedFolders: string[];
		demotedPriorFolders: string[];
		/** ファイル検索で、ひらがなとカタカナを同じ文字として扱う。オプションのメニューで切り替える。 */
		foldKana: boolean;
		/** Obsidian で開けない拡張子のファイルを、ファイル検索の一覧から除く。除外フォルダーとは別の判定。 */
		openableFilesOnly: boolean;
	};
	everything: {
		httpUrl: string;
		username: string;
		password: string;
		maxResults: number;
		debounceMs: number;
		requestTimeoutMs: number;
		vaultExtensions: string[];
	};
	audit: AuditSettings;
}

export interface AuditSettings {
	/** Vault 監査が一覧にする種類。オプションのメニューで選び、すべての画面で共有する。 */
	kind: AuditKind;
}

export const DEFAULT_SETTINGS: MyPaletteSettings = {
	integrations: {
		everything: { enabled: true },
		smartConnections: { enabled: true },
	},
	hotkeys: DEFAULT_HOTKEYS,
	schemaVersion: SETTINGS_SCHEMA_VERSION,
	showLog: false,
	home: { returnAfterSeconds: 90 },
	paletteDisplay: {
		table: { highlightSearchMatches: true },
		view: { highlightSearchMatches: true },
		palette: { highlightSearchMatches: true },
	},
	openExternalMarkdownInObsidian: true,
	focusExistingTab: true,
	searchHistory: {
		enabled: true,
		addDelayMs: SETTING_DEFAULTS.searchHistory.addDelayMs,
		daysToKeep: SETTING_DEFAULTS.searchHistory.daysToKeep,
	},
	modes: {
		notes: { alias: "n", enabled: true },
		commands: { alias: ">", enabled: true },
		everything: { alias: "e", enabled: true },
		outlinks: { alias: "o", enabled: true },
		backlinks: { alias: "b", enabled: true },
		bookmarks: { alias: "bk", enabled: true },
		smart: { alias: "sc", enabled: true },
		tabs: { alias: "t", enabled: true },
		plugins: { alias: "p", enabled: true },
		snippets: { alias: "sn", enabled: true },
		properties: { alias: "pr", enabled: true },
		audit: { alias: "a", enabled: true },
	},
	file: {
		// 2つの状態を同じに始め、分けたことで制御は増えるが、新規インストールでユーザーが期待する
		// 並び順は変えないようにする。
		sortPriorities: {
			blank: [...DEFAULT_BLANK_FILE_SORT_PRIORITIES],
			input: [...DEFAULT_FILE_SORT_PRIORITIES],
		},
		// プラグイン共通の除外フォルダー。Obsidian の除外設定とは独立に、すべての一覧へ適用する。
		excludedFolders: [],
		// フォルダーの優先度低下はフロントマターとは別に保ち、ユーザーが順位の位置を選べるようにする。
		demotedPriorFolders: [],
		foldKana: false,
		openableFilesOnly: false,
	},
	everything: {
		httpUrl: "http://127.0.0.1:51361/",
		username: "",
		password: "",
		maxResults: SETTING_DEFAULTS.everything.maxResults,
		debounceMs: SETTING_DEFAULTS.everything.debounceMs,
		requestTimeoutMs: SETTING_DEFAULTS.everything.requestTimeoutMs,
		vaultExtensions: ["md", "canvas", "base"],
	},
	audit: { kind: "orphaned-files" },
};
