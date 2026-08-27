import type {
	MyPaletteSettings,
	SearchHistoryCategory,
	SearchHistoryEntry,
} from "src/model/settings";
import {
	DEFAULT_SETTINGS,
	MAX_RECENT_COMMAND_IDS,
	SETTING_LIMITS,
	SETTINGS_SCHEMA_VERSION,
	normalizeFileSortPriorities,
} from "src/model/settings";
import { getSearchHistoryCategory, parseInput, type Prefixes } from "src/palette/inputParser";

/**
 * `data.json` is untrusted persisted input. Keeping normalization separate from
 * the Obsidian settings UI lets the migration contract stay pure and testable.
 */

export function bounded(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;
}

export function extensions(value: unknown): string[] {
	if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.everything.vaultExtensions];
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim().replace(/^\./, "").toLocaleLowerCase())
		.filter((item) => /^[a-z0-9_-]+$/.test(item));
	return [...new Set(normalized)];
}

function isSearchHistoryCategory(value: unknown): value is SearchHistoryCategory {
	return (
		value === "file" ||
		value === "command" ||
		value === "bookmark" ||
		value === "smart" ||
		value === "everything" ||
		value === "everything-directory" ||
		value === "link" ||
		value === "backlink"
	);
}

function searchHistoryEntries(value: unknown, prefixes: Prefixes): SearchHistoryEntry[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item): SearchHistoryEntry[] => {
		if (!item || typeof item !== "object") return [];
		const entry = item as Record<string, unknown>;
		if (
			typeof entry.input !== "string" ||
			typeof entry.lastSearchedAt !== "number" ||
			!Number.isFinite(entry.lastSearchedAt) ||
			typeof entry.count !== "number" ||
			!Number.isFinite(entry.count)
		)
			return [];
		const parsed = parseInput(entry.input, prefixes);
		const category = isSearchHistoryCategory(entry.category)
			? entry.category
			: getSearchHistoryCategory(parsed);
		return [
			{
				input: isSearchHistoryCategory(entry.category) ? entry.input : parsed.query,
				category,
				includeIgnored:
					typeof entry.includeIgnored === "boolean"
						? entry.includeIgnored
						: parsed.includeIgnored,
				lastSearchedAt: entry.lastSearchedAt,
				count: Math.max(1, Math.round(entry.count)),
			},
		];
	});
}

export function mergeSettings(data: unknown): MyPaletteSettings {
	const source = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const rawPrefixes = (source.prefixes ?? {}) as Record<string, unknown>;
	const rawFile = (source.file ?? {}) as Record<string, unknown>;
	const rawEverything = (source.everything ?? {}) as Record<string, unknown>;
	const prefixes = {
		command: typeof rawPrefixes.command === "string" ? rawPrefixes.command : ">",
		everything: typeof rawPrefixes.everything === "string" ? rawPrefixes.everything : "e ",
		includeIgnored:
			typeof rawPrefixes.includeIgnored === "string"
				? rawPrefixes.includeIgnored
				: DEFAULT_SETTINGS.prefixes.includeIgnored,
	};
	const rawSearchHistory =
		source.searchHistory && typeof source.searchHistory === "object"
			? (source.searchHistory as Record<string, unknown>)
			: {};

	return {
		...DEFAULT_SETTINGS,
		schemaVersion: SETTINGS_SCHEMA_VERSION,
		showLog: typeof source.showLog === "boolean" ? source.showLog : false,
		rememberLastInput:
			typeof source.rememberLastInput === "boolean" ? source.rememberLastInput : false,
		openExternalMarkdownInObsidian:
			typeof source.openExternalMarkdownInObsidian === "boolean"
				? source.openExternalMarkdownInObsidian
				: true,
		searchHistory: {
			enabled:
				typeof rawSearchHistory.enabled === "boolean"
					? rawSearchHistory.enabled
					: DEFAULT_SETTINGS.searchHistory.enabled,
			addDelayMs: bounded(
				rawSearchHistory.addDelayMs,
				DEFAULT_SETTINGS.searchHistory.addDelayMs,
				SETTING_LIMITS.searchHistory.addDelayMs.min,
				SETTING_LIMITS.searchHistory.addDelayMs.max,
			),
			daysToKeep: bounded(
				rawSearchHistory.daysToKeep,
				DEFAULT_SETTINGS.searchHistory.daysToKeep,
				SETTING_LIMITS.searchHistory.daysToKeep.min,
				SETTING_LIMITS.searchHistory.daysToKeep.max,
			),
			entries: searchHistoryEntries(rawSearchHistory.entries, prefixes),
		},
		prefixes,
		file: {
			sortPriorities: normalizeFileSortPriorities(rawFile.sortPriorities),
		},
		everything: {
			httpUrl:
				typeof rawEverything.httpUrl === "string" && rawEverything.httpUrl.trim()
					? rawEverything.httpUrl.trim()
					: DEFAULT_SETTINGS.everything.httpUrl,
			username: typeof rawEverything.username === "string" ? rawEverything.username : "",
			password: typeof rawEverything.password === "string" ? rawEverything.password : "",
			maxResults: bounded(
				rawEverything.maxResults,
				DEFAULT_SETTINGS.everything.maxResults,
				SETTING_LIMITS.everything.maxResults.min,
				SETTING_LIMITS.everything.maxResults.max,
			),
			debounceMs: bounded(
				rawEverything.debounceMs,
				DEFAULT_SETTINGS.everything.debounceMs,
				SETTING_LIMITS.everything.debounceMs.min,
				SETTING_LIMITS.everything.debounceMs.max,
			),
			requestTimeoutMs: bounded(
				rawEverything.requestTimeoutMs,
				DEFAULT_SETTINGS.everything.requestTimeoutMs,
				SETTING_LIMITS.everything.requestTimeoutMs.min,
				SETTING_LIMITS.everything.requestTimeoutMs.max,
			),
			vaultExtensions: extensions(rawEverything.vaultExtensions),
			directorySearchMarkdownOnly:
				typeof rawEverything.directorySearchMarkdownOnly === "boolean"
					? rawEverything.directorySearchMarkdownOnly
					: true,
		},
		recentCommandIds: Array.isArray(source.recentCommandIds)
			? source.recentCommandIds
					.filter((id): id is string => typeof id === "string")
					.slice(0, MAX_RECENT_COMMAND_IDS)
			: [],
	};
}
