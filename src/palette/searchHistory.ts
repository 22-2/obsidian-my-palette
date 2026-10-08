import type { Prefixes } from "src/palette/inputParser";
import { getSearchHistoryCategory, parseInput, RELATED_PREFIXES } from "src/palette/inputParser";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/settings/model";

export interface RecordSearchHistoryOptions {
	now: number;
	daysToKeep: number;
	maxEntries: number;
	includeIgnored?: boolean;
}

export const SEARCH_HISTORY_MAX_ENTRIES = 256;

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
		includeIgnored: source.includeIgnored === true ? true : undefined,
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
	prefixes: Prefixes,
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
		const parsed = parseInput(source.input, prefixes);
		const category = isSearchHistoryCategory(source.category)
			? source.category
			: getSearchHistoryCategory(parsed);
		return [
			{
				input: isSearchHistoryCategory(source.category) ? source.input : parsed.query,
				category,
				includeIgnored:
					typeof source.includeIgnored === "boolean"
						? source.includeIgnored || undefined
						: parsed.includeIgnored || undefined,
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

/** Rebuilds the palette input that would produce the given history entry. */
export function formatSearchHistoryInput(entry: SearchHistoryEntry, prefixes: Prefixes): string {
	const modeInput = `${historyCategoryPrefix(entry.category, prefixes)}${entry.input}`;
	// Related searches intentionally do not support the ignored-note scope;
	// avoid reconstructing an input that the parser would interpret as File mode.
	return entry.includeIgnored && entry.category !== "link" && entry.category !== "backlink"
		? `${prefixes.includeIgnored.trimEnd()} ${modeInput}`
		: modeInput;
}

function historyCategoryPrefix(category: SearchHistoryCategory, prefixes: Prefixes): string {
	switch (category) {
		case "command":
			return `${prefixes.command.trimEnd()} `;
		case "bookmark":
			return "bk ";
		case "smart":
			return "sc ";
		case "everything":
			return `${prefixes.everything.trimEnd()} `;
		case "everything-directory":
			return "esdir ";
		case "link":
			return RELATED_PREFIXES.link;
		case "backlink":
			return RELATED_PREFIXES.backlink;
		case "file":
			return "";
	}
}
