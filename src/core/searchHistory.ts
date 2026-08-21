import type { SearchHistoryCategory, SearchHistoryEntry } from "src/model/settings";

export interface RecordSearchHistoryOptions {
	now: number;
	daysToKeep: number;
	maxEntries: number;
	includeIgnored?: boolean;
}

const DEFAULT_MAX_ENTRIES = 256;

function sameSearch(
	entry: SearchHistoryEntry,
	input: string,
	category: SearchHistoryCategory,
	includeIgnored: boolean,
): boolean {
	return (
		entry.category === category &&
		entry.input.toLocaleLowerCase() === input.toLocaleLowerCase() &&
		Boolean(entry.includeIgnored) === includeIgnored
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
		maxEntries = DEFAULT_MAX_ENTRIES,
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
	maxEntries = DEFAULT_MAX_ENTRIES,
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
