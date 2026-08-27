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
	entries: SearchHistoryEntry[];
}

export const FILE_SORT_PRIORITY_LIST = [
	"Prefix name match",
	"Fuzzy name match",
	"Last opened",
	"Last modified",
	"Aliases count",
	"Alphabetical",
	"Alphabetical reverse",
] as const;

export type FileSortPriority =
	| (typeof FILE_SORT_PRIORITY_LIST)[number]
	| "@prior"
	| "@prior:asc"
	| "@prior:desc";

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

export function normalizeFileSortPriorities(value: unknown): FileSortPriority[] {
	if (!Array.isArray(value)) return [...DEFAULT_FILE_SORT_PRIORITIES];
	return value.flatMap((item): FileSortPriority[] => {
		if (typeof item !== "string") return [];
		const priority = item.trim();
		return isFileSortPriority(priority) ? [priority] : [];
	});
}

// Keep the existing relevance and recency behavior while making `prior` useful
// by default as a tie-breaker and as the first meaningful criterion for empty input.
export const DEFAULT_FILE_SORT_PRIORITIES: readonly FileSortPriority[] = [
	"Prefix name match",
	"Fuzzy name match",
	"@prior:desc",
	"Last opened",
	"Last modified",
];

export interface MyPaletteSettings {
	schemaVersion: 9;
	showLog: boolean;
	rememberLastInput: boolean;
	openExternalMarkdownInObsidian: boolean;
	searchHistory: SearchHistorySettings;
	prefixes: { command: string; everything: string; includeIgnored: string };
	file: {
		sortPriorities: FileSortPriority[];
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
	recentCommandIds: string[];
}

export const DEFAULT_SETTINGS: MyPaletteSettings = {
	schemaVersion: 9,
	showLog: false,
	rememberLastInput: false,
	openExternalMarkdownInObsidian: true,
	searchHistory: {
		enabled: true,
		addDelayMs: 3000,
		daysToKeep: 0,
		entries: [],
	},
	prefixes: { command: ">", everything: "e ", includeIgnored: "i " },
	file: {
		sortPriorities: [...DEFAULT_FILE_SORT_PRIORITIES],
	},
	everything: {
		httpUrl: "http://127.0.0.1:51361/",
		username: "",
		password: "",
		maxResults: 100,
		debounceMs: 150,
		requestTimeoutMs: 30000,
		vaultExtensions: ["md", "canvas", "base"],
		directorySearchMarkdownOnly: true,
	},
	recentCommandIds: [],
};
