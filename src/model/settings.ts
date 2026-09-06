export interface SearchHistoryEntry {
	input: string;
	category: SearchHistoryCategory;
	includeIgnored?: boolean;
	lastSearchedAt: number;
	count: number;
}

export type SearchHistoryCategory =
	| "file"
	| "command"
	| "bookmark"
	| "smart"
	| "everything"
	| "everything-directory"
	| "link"
	| "backlink";

export interface SearchHistorySettings {
	enabled: boolean;
	addDelayMs: number;
	daysToKeep: number;
}

export const SETTINGS_SCHEMA_VERSION = 16;
export const MAX_RECENT_COMMAND_IDS = 20;
export const MILLISECONDS_PER_SECOND = 1_000;
export const DISABLED_DELAY_MS = 0;
export const UNLIMITED_DAYS = 0;

/**
 * Keep persisted defaults in one named block so validation and the settings UI
 * cannot silently drift when a default changes.
 */
export const SETTING_DEFAULTS = {
	searchHistory: {
		// Search history is most useful when it reflects an action the user
		// completed, so idle input must be opt-in rather than the default.
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
 * The same ranges drive both data sanitization and slider controls, keeping
 * interactive edits consistent with values loaded from data.json.
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
 * These strings are persisted in data.json, so the names are stable setting
 * tokens as well as labels shown in documentation. Keep them centralized so a
 * sorter branch and a migration cannot accidentally drift apart.
 */
export const FILE_SORT_PRIORITIES = {
	filenamePrefixMatch: "Filename prefix match",
	aliasPrefixMatch: "Alias prefix match",
	filenameFuzzyMatch: "Filename fuzzy match",
	aliasFuzzyMatch: "Alias fuzzy match",
	tagMatch: "Tag match",
	matchCoverage: "Match coverage",
	folderPathMatch: "Folder path match",
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
	// The first version of this setting shipped combined name/alias priorities;
	// migrate its untouched defaults so existing users receive the separated behavior.
	if (isPriorityList(trimmed, LEGACY_DEFAULT_FILE_SORT_PRIORITIES)) return [...fallback];
	// Adding a new default priority should reach users who never customized the
	// previous list, while an arbitrary custom order remains exactly as entered.
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
	// A dual list represents enablement, so repeated tokens cannot be expressed
	// meaningfully and would otherwise appear as ambiguous duplicate rows.
	return [...new Set(normalized)];
}

// Keep the existing relevance and recency behavior while making `prior` useful
// by default as a tie-breaker and as the first meaningful criterion for empty input.
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

// 空クエリ時はマッチ系が除去されるため、有効なデフォルトは Activity → Last modified →
// @prior:desc の順になる。ユーザーの実設定に合わせて blank だけ別デフォルトにするっす。
export const DEFAULT_BLANK_FILE_SORT_PRIORITIES: readonly FileSortPriority[] = [
	FILE_SORT_PRIORITIES.activity,
	FILE_SORT_PRIORITIES.lastModified,
	FILE_SORT_PRIORITIES.priorDesc,
];

export interface MyPaletteSettings {
	schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
	showLog: boolean;
	rememberLastInput: boolean;
	openExternalMarkdownInObsidian: boolean;
	searchHistory: SearchHistorySettings;
	prefixes: { command: string; everything: string; includeIgnored: string };
	file: {
		sortPriorities: FileSortPriorities;
	};
	everything: {
		httpUrl: string;
		username: string;
		password: string;
		maxResults: number;
		debounceMs: number;
		requestTimeoutMs: number;
		vaultExtensions: string[];
		directorySearchMarkdownOnly: boolean;
	};
}

export const DEFAULT_SETTINGS: MyPaletteSettings = {
	schemaVersion: SETTINGS_SCHEMA_VERSION,
	showLog: false,
	rememberLastInput: false,
	openExternalMarkdownInObsidian: true,
	searchHistory: {
		enabled: true,
		addDelayMs: SETTING_DEFAULTS.searchHistory.addDelayMs,
		daysToKeep: SETTING_DEFAULTS.searchHistory.daysToKeep,
	},
	prefixes: { command: ">", everything: "e ", includeIgnored: "i " },
	file: {
		// Start both states identically so the split adds control without changing
		// the ordering users already expect from a fresh installation.
		sortPriorities: {
			blank: [...DEFAULT_BLANK_FILE_SORT_PRIORITIES],
			input: [...DEFAULT_FILE_SORT_PRIORITIES],
		},
	},
	everything: {
		httpUrl: "http://127.0.0.1:51361/",
		username: "",
		password: "",
		maxResults: SETTING_DEFAULTS.everything.maxResults,
		debounceMs: SETTING_DEFAULTS.everything.debounceMs,
		requestTimeoutMs: SETTING_DEFAULTS.everything.requestTimeoutMs,
		vaultExtensions: ["md", "canvas", "base"],
		directorySearchMarkdownOnly: true,
	},
};
