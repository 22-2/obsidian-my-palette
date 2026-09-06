import type { MyPaletteSettings } from "src/model/settings";
import {
	DEFAULT_BLANK_FILE_SORT_PRIORITIES,
	DEFAULT_SETTINGS,
	SETTING_LIMITS,
	SETTINGS_SCHEMA_VERSION,
	normalizeFileSortPriorities,
} from "src/model/settings";

const PREVIOUS_DEFAULT_SEARCH_HISTORY_DELAY_MS = 3_000;
// Schema 12 changed the default from delayed input to action-only history;
// later schema bumps must not reinterpret a user's explicit 3-second delay.
const SEARCH_HISTORY_ACTION_ONLY_SCHEMA_VERSION = 12;

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
	const storedSchemaVersion =
		typeof source.schemaVersion === "number" ? source.schemaVersion : undefined;
	const migratedSearchHistoryDelay =
		// Treat the previous default as a migration value, while preserving an
		// explicit delay in settings written by the new schema.
		(storedSchemaVersion === undefined ||
			storedSchemaVersion < SEARCH_HISTORY_ACTION_ONLY_SCHEMA_VERSION) &&
		rawSearchHistory.addDelayMs === PREVIOUS_DEFAULT_SEARCH_HISTORY_DELAY_MS
			? DEFAULT_SETTINGS.searchHistory.addDelayMs
			: rawSearchHistory.addDelayMs;
	const rawSortPriorities = rawFile.sortPriorities;
	const legacySortPriorities = normalizeFileSortPriorities(rawSortPriorities);
	const legacyBlankSortPriorities = normalizeFileSortPriorities(
		rawSortPriorities,
		DEFAULT_BLANK_FILE_SORT_PRIORITIES,
	);
	// The old setting controlled both query states. Copy it into each branch so
	// upgrading does not silently change either empty or typed search ordering.
	const sortPriorities =
		rawSortPriorities &&
		typeof rawSortPriorities === "object" &&
		!Array.isArray(rawSortPriorities)
			? {
					blank: normalizeFileSortPriorities(
						(rawSortPriorities as Record<string, unknown>).blank,
						DEFAULT_BLANK_FILE_SORT_PRIORITIES,
					),
					input: normalizeFileSortPriorities(
						(rawSortPriorities as Record<string, unknown>).input,
					),
				}
			: { blank: [...legacyBlankSortPriorities], input: [...legacySortPriorities] };

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
				migratedSearchHistoryDelay,
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
		},
		prefixes,
		file: {
			sortPriorities,
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
	};
}
