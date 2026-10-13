import { getSearchHistoryCategory, parseInput } from "src/palette/inputParser";
import { paletteModeAlias, type PaletteModeId } from "src/palette/modes";
import type {
	ModeSettingsMap,
	SearchHistoryCategory,
	SearchHistoryEntry,
	SelectorHistoryCategory,
} from "src/settings/model";

export interface RecordSearchHistoryOptions {
	now: number;
	daysToKeep: number;
	maxEntries: number;
	includeIgnored?: boolean;
}

export const SEARCH_HISTORY_MAX_ENTRIES = 256;

/** Categories of the palette's own searches. Selectors each keep one category of their own. */
export const PALETTE_HISTORY_CATEGORIES: readonly SearchHistoryCategory[] = [
	"file",
	"command",
	"bookmark",
	"smart",
	"tab",
	"plugin",
	"everything",
	"everything-directory",
	"link",
	"backlink",
];

const LEGACY_INCLUDE_IGNORED_PREFIX = "i ";

function isSelectorHistoryCategory(value: unknown): value is SelectorHistoryCategory {
	return value === "tag-insertion" || value === "moc-insertion" || value === "folder-move";
}

function isSearchHistoryCategory(value: unknown): value is SearchHistoryCategory {
	return (
		value === "file" ||
		value === "command" ||
		value === "bookmark" ||
		value === "smart" ||
		value === "tab" ||
		value === "plugin" ||
		value === "everything" ||
		value === "everything-directory" ||
		value === "link" ||
		value === "backlink" ||
		isSelectorHistoryCategory(value)
	);
}

/**
 * Use one identity for the in-memory map and IndexedDB key so case-only
 * updates cannot create duplicate history rows during persistence migration.
 */
export function getSearchHistoryEntryIdentity(
	entry: Pick<SearchHistoryEntry, "input" | "category" | "includeIgnored">,
): string {
	return JSON.stringify([
		entry.category,
		Boolean(entry.includeIgnored),
		entry.input.toLocaleLowerCase(),
	]);
}

/** Normalize a row already carrying an explicit, supported history category. */
export function normalizeSearchHistoryEntry(value: unknown): SearchHistoryEntry | undefined {
	if (!value || typeof value !== "object") return undefined;
	const source = value as Record<string, unknown>;
	if (
		typeof source.input !== "string" ||
		!isSearchHistoryCategory(source.category) ||
		typeof source.lastSearchedAt !== "number" ||
		!Number.isFinite(source.lastSearchedAt) ||
		typeof source.count !== "number" ||
		!Number.isFinite(source.count)
	)
		return undefined;
	return {
		input: source.input,
		category: source.category,
		includeIgnored:
			!isSelectorHistoryCategory(source.category) &&
			(source.includeIgnored === true || source.category === "everything-directory")
				? true
				: undefined,
		lastSearchedAt: source.lastSearchedAt,
		count: Math.max(1, Math.round(source.count)),
	};
}

/**
 * Parse the legacy `data.json` representation before handing it to IndexedDB.
 * Invalid explicit categories retain the historical prefix-based inference so
 * old entries remain usable while the storage backend changes.
 */
export function parseStoredSearchHistoryEntries(
	value: unknown,
	modes: ModeSettingsMap,
): SearchHistoryEntry[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item): SearchHistoryEntry[] => {
		if (!item || typeof item !== "object") return [];
		const source = item as Record<string, unknown>;
		if (
			typeof source.input !== "string" ||
			typeof source.lastSearchedAt !== "number" ||
			!Number.isFinite(source.lastSearchedAt) ||
			typeof source.count !== "number" ||
			!Number.isFinite(source.count)
		)
			return [];
		// Rows from before the Obsidian-excluded switch kept that scope as an `i ` prefix.
		const legacyIgnored = source.input
			.toLocaleLowerCase()
			.startsWith(LEGACY_INCLUDE_IGNORED_PREFIX);
		const parsed = parseInput(
			legacyIgnored ? source.input.slice(LEGACY_INCLUDE_IGNORED_PREFIX.length) : source.input,
			modes,
		);
		const category = isSearchHistoryCategory(source.category)
			? source.category
			: getSearchHistoryCategory(parsed);
		// Selector entries store the complete input, including MOC prefixes and
		// folder names. Do not reinterpret their text as a palette search scope.
		return [
			{
				input: isSearchHistoryCategory(source.category) ? source.input : parsed.query,
				category,
				includeIgnored: isSelectorHistoryCategory(category)
					? undefined
					: typeof source.includeIgnored === "boolean"
						? source.includeIgnored || category === "everything-directory" || undefined
						: legacyIgnored || category === "everything-directory" || undefined,
				lastSearchedAt: source.lastSearchedAt,
				count: Math.max(1, Math.round(source.count)),
			},
		];
	});
}

function sameSearch(
	entry: SearchHistoryEntry,
	input: string,
	category: SearchHistoryCategory,
	includeIgnored: boolean,
): boolean {
	return (
		getSearchHistoryEntryIdentity(entry) ===
		getSearchHistoryEntryIdentity({ input, category, includeIgnored })
	);
}

function pruneSearchHistory(
	entries: readonly SearchHistoryEntry[],
	now: number,
	daysToKeep: number,
	maxEntries: number,
): SearchHistoryEntry[] {
	const oldestAllowed =
		daysToKeep > 0 ? now - daysToKeep * 24 * 60 * 60 * 1000 : Number.NEGATIVE_INFINITY;
	return entries
		.filter((entry) => entry.lastSearchedAt >= oldestAllowed)
		.sort((a, b) => b.lastSearchedAt - a.lastSearchedAt)
		.slice(0, Math.max(1, maxEntries));
}

export function recordSearchHistory(
	entries: readonly SearchHistoryEntry[],
	input: string,
	category: SearchHistoryCategory,
	{
		now,
		daysToKeep,
		maxEntries = SEARCH_HISTORY_MAX_ENTRIES,
		includeIgnored = false,
	}: RecordSearchHistoryOptions,
): SearchHistoryEntry[] {
	if (!input.trim()) return pruneSearchHistory(entries, now, daysToKeep, maxEntries);

	const next = entries.map((entry) => ({ ...entry }));
	const existingIndex = next.findIndex((entry) =>
		sameSearch(entry, input, category, includeIgnored),
	);
	if (existingIndex >= 0) {
		const existing = next[existingIndex];
		next[existingIndex] = {
			...existing,
			input,
			category,
			includeIgnored: includeIgnored || undefined,
			lastSearchedAt: now,
			count: existing.count + 1,
		};
	} else {
		next.push({
			input,
			category,
			includeIgnored: includeIgnored || undefined,
			lastSearchedAt: now,
			count: 1,
		});
	}
	return pruneSearchHistory(next, now, daysToKeep, maxEntries);
}

export function pruneStoredSearchHistory(
	entries: readonly SearchHistoryEntry[],
	now: number,
	daysToKeep: number,
	maxEntries = SEARCH_HISTORY_MAX_ENTRIES,
): SearchHistoryEntry[] {
	return pruneSearchHistory(
		entries.map((entry) => ({ ...entry })),
		now,
		daysToKeep,
		maxEntries,
	);
}

export function getSearchHistorySuggestions(
	entries: readonly SearchHistoryEntry[],
	input: string,
	category: SearchHistoryCategory,
	limit = 30,
	includeIgnored = false,
): SearchHistoryEntry[] {
	const needle = input.toLocaleLowerCase();
	return entries
		.filter(
			(entry) =>
				entry.category === category &&
				Boolean(entry.includeIgnored) === includeIgnored &&
				(!needle || entry.input.toLocaleLowerCase().includes(needle)),
		)
		.sort((a, b) => b.count - a.count || b.lastSearchedAt - a.lastSearchedAt)
		.slice(0, Math.max(0, limit))
		.map((entry) => ({ ...entry }));
}

/**
 * Rebuilds the palette input that would produce the given history entry. The
 * Obsidian-excluded scope is not part of the text; hosts restore it on their switch.
 */
export function formatSearchHistoryInput(
	entry: SearchHistoryEntry,
	modes: ModeSettingsMap,
): string {
	if (isSelectorHistoryCategory(entry.category)) return entry.input;
	return `${historyCategoryPrefix(entry.category, modes)}${entry.input}`;
}

function historyCategoryPrefix(category: SearchHistoryCategory, modes: ModeSettingsMap): string {
	const modeId = historyCategoryMode(category);
	return modeId ? `${paletteModeAlias(modeId, modes)} ` : "";
}

function historyCategoryMode(category: SearchHistoryCategory): PaletteModeId | undefined {
	switch (category) {
		case "command":
			return "commands";
		case "bookmark":
			return "bookmarks";
		case "smart":
			return "smart";
		case "tab":
			return "tabs";
		case "plugin":
			return "plugins";
		case "everything":
		case "everything-directory":
			return "everything";
		case "link":
			return "outlinks";
		case "backlink":
			return "backlinks";
		case "file":
		case "tag-insertion":
		case "moc-insertion":
		case "folder-move":
			return undefined;
	}
}
