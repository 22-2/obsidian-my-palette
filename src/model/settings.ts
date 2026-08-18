export interface SearchHistoryEntry {
	input: string;
	category: SearchHistoryCategory;
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

export interface MyPaletteSettings {
	schemaVersion: 7;
	showLog: boolean;
	rememberLastInput: boolean;
	openExternalMarkdownInObsidian: boolean;
	searchHistory: SearchHistorySettings;
	prefixes: { command: string; everything: string };
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
	schemaVersion: 7,
	showLog: false,
	rememberLastInput: false,
	openExternalMarkdownInObsidian: true,
	searchHistory: {
		enabled: true,
		addDelayMs: 3000,
		daysToKeep: 360,
		entries: [],
	},
	prefixes: { command: ">", everything: "e " },
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
