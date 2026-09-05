import {
	DEFAULT_FILE_SORT_PRIORITIES,
	FILE_SORT_PRIORITIES,
	parseFileSortPriority,
	type FileSortPriority,
} from "src/model/settings";
import {
	extractFileMatchSignals,
	type FileMatch,
	type FileMatchSignals,
	type SortableFileEntry,
} from "src/search/file/fileMatch";

// Keep the existing module exports stable while the match data model lives
// outside the comparator, so future providers can create signals without
// importing the sorting implementation.
export { extractFileMatchSignals };
export type { FileMatch, FileMatchSignals, SortableFileEntry };

interface SortContext {
	query?: string;
	recent: ReadonlyMap<string, number>;
	usageScores: ReadonlyMap<string, number>;
	signalsA: FileMatchSignals;
	signalsB: FileMatchSignals;
}

const EMPTY_MATCH_SIGNALS: FileMatchSignals = {};
const EMPTY_USAGE_SCORES: ReadonlyMap<string, number> = new Map();

const QUERY_SORT_PRIORITIES = new Set<FileSortPriority>([
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	FILE_SORT_PRIORITIES.tagMatch,
	FILE_SORT_PRIORITIES.matchCoverage,
	FILE_SORT_PRIORITIES.pathFuzzyMatch,
]);

function normalized(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function hasPrefixMatch(
	entry: SortableFileEntry,
	query: string,
	field: "filename" | "alias",
): boolean {
	const needle = normalized(query);
	const values = field === "filename" ? [entry.basename] : entry.aliases;
	return values.some((value) => normalized(value).startsWith(needle));
}

function compareNumber(a: number, b: number, order: "asc" | "desc" = "asc"): number {
	if (a === b) return 0;
	const result = a < b ? -1 : 1;
	return order === "asc" ? result : -result;
}

function compareOptionalScore(a: number | undefined, b: number | undefined): number {
	const scoreA = typeof a === "number" && Number.isFinite(a) ? a : undefined;
	const scoreB = typeof b === "number" && Number.isFinite(b) ? b : undefined;
	// A candidate can match through another field; keep it behind candidates that
	// actually matched the field selected by this priority.
	if (scoreA === undefined && scoreB === undefined) return 0;
	if (scoreA === undefined) return 1;
	if (scoreB === undefined) return -1;
	return compareNumber(scoreA, scoreB, "desc");
}

function compareContiguousMatch(a: boolean | undefined, b: boolean | undefined): number {
	// Keep exact phrase relevance ahead of user-selected fuzzy fields while
	// leaving legacy callers without this metadata in the normal priority flow.
	if (a === true && b !== true) return -1;
	if (b === true && a !== true) return 1;
	return 0;
}

function compareOptionalPrior(
	a: SortableFileEntry,
	b: SortableFileEntry,
	order: "asc" | "desc",
): number {
	const priorA = typeof a.prior === "number" && Number.isFinite(a.prior) ? a.prior : undefined;
	const priorB = typeof b.prior === "number" && Number.isFinite(b.prior) ? b.prior : undefined;
	// Missing and null values are not priorities; keeping them last preserves the
	// user's explicit ranking without making unannotated notes disappear.
	if (priorA === undefined && priorB === undefined) return 0;
	if (priorA === undefined) return 1;
	if (priorB === undefined) return -1;
	return compareNumber(priorA, priorB, order);
}

function compareRecent(
	a: SortableFileEntry,
	b: SortableFileEntry,
	recent: ReadonlyMap<string, number>,
): number {
	const indexA = recent.get(a.path);
	const indexB = recent.get(b.path);
	// Infinity - Infinity is NaN, which makes Array#sort's result engine-dependent.
	// Compare absent history explicitly so the comparator always returns a number.
	if (indexA === undefined && indexB === undefined) return 0;
	if (indexA === undefined) return 1;
	if (indexB === undefined) return -1;
	return indexA - indexB;
}

function compareUsage(
	a: SortableFileEntry,
	b: SortableFileEntry,
	usageScores: ReadonlyMap<string, number>,
): number {
	// Usage is an optional, bounded hint. Missing records stay behind recorded
	// notes only when this priority is explicitly selected by the user.
	return compareOptionalScore(usageScores.get(a.path), usageScores.get(b.path));
}

function compareFallback(a: SortableFileEntry, b: SortableFileEntry): number {
	return (
		b.mtime - a.mtime ||
		a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" }) ||
		a.path.localeCompare(b.path, undefined, { sensitivity: "base" })
	);
}

function compareAlphabetical(a: SortableFileEntry, b: SortableFileEntry, reverse = false): number {
	const result =
		a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" }) ||
		a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
	return reverse ? -result : result;
}

function compareIgnored(a: SortableFileEntry, b: SortableFileEntry): number {
	// The include-ignored prefix is an explicit request to inspect archived notes,
	// so those candidates should be visible before the much larger normal set.
	return Number(Boolean(b.ignored)) - Number(Boolean(a.ignored));
}

function comparePriority(
	priority: FileSortPriority,
	a: SortableFileEntry,
	b: SortableFileEntry,
	context: SortContext,
): number {
	switch (priority) {
		case FILE_SORT_PRIORITIES.filenamePrefixMatch:
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query, "filename")) -
						Number(hasPrefixMatch(a, context.query, "filename"));
		case FILE_SORT_PRIORITIES.aliasPrefixMatch:
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query, "alias")) -
						Number(hasPrefixMatch(a, context.query, "alias"));
		case FILE_SORT_PRIORITIES.filenameFuzzyMatch:
			return compareOptionalScore(
				context.signalsA.filenameScore,
				context.signalsB.filenameScore,
			);
		case FILE_SORT_PRIORITIES.aliasFuzzyMatch:
			return compareOptionalScore(context.signalsA.aliasScore, context.signalsB.aliasScore);
		case FILE_SORT_PRIORITIES.tagMatch:
			// A note can match the query through another field; keep notes with no
			// matching tag behind notes that have an explicit tag contribution.
			return compareOptionalScore(
				context.signalsA.tagMatchCount,
				context.signalsB.tagMatchCount,
			);
		case FILE_SORT_PRIORITIES.matchCoverage:
			// Coverage is opt-in/configurable so its cross-field signal cannot bypass
			// the user's chosen filename, alias, tag, or property priorities.
			return compareOptionalScore(
				context.signalsA.matchCoverage,
				context.signalsB.matchCoverage,
			);
		case FILE_SORT_PRIORITIES.pathFuzzyMatch:
			return compareOptionalScore(context.signalsA.pathScore, context.signalsB.pathScore);
		case FILE_SORT_PRIORITIES.lastOpened:
			return compareRecent(a, b, context.recent);
		case FILE_SORT_PRIORITIES.usageHistory:
			return compareUsage(a, b, context.usageScores);
		case FILE_SORT_PRIORITIES.lastModified:
			return compareNumber(a.mtime, b.mtime, "desc");
		case FILE_SORT_PRIORITIES.aliasesCount:
			// Alias count is a derived centrality signal, not the first alias value;
			// keep it opt-in so a few heavily aliased notes do not dominate by default.
			return compareNumber(a.aliases.length, b.aliases.length, "desc");
		case FILE_SORT_PRIORITIES.alphabetical:
			return compareAlphabetical(a, b);
		case FILE_SORT_PRIORITIES.alphabeticalReverse:
			return compareAlphabetical(a, b, true);
		default: {
			const property = parseFileSortPriority(priority);
			return property?.key === "prior" ? compareOptionalPrior(a, b, property.order) : 0;
		}
	}
}

function comparePriorities(
	a: SortableFileEntry,
	b: SortableFileEntry,
	priorities: readonly FileSortPriority[],
	context: SortContext,
): number {
	for (const priority of priorities) {
		const result = comparePriority(priority, a, b, context);
		if (result !== 0) return result;
	}
	return 0;
}

export function filterNoQueryPriorities(
	priorities: readonly FileSortPriority[],
): FileSortPriority[] {
	// Match-based priorities have no signal for an empty query; AQS applies the
	// same rule so property and recency priorities can still work for empty input.
	return priorities.filter((priority) => !QUERY_SORT_PRIORITIES.has(priority));
}

export function sortFilesWithoutQuery<T extends SortableFileEntry>(
	entries: T[],
	recent: ReadonlyMap<string, number>,
	priorities: readonly FileSortPriority[] = DEFAULT_FILE_SORT_PRIORITIES,
	usageScores?: ReadonlyMap<string, number>,
): T[] {
	const noQueryPriorities = filterNoQueryPriorities(priorities);
	return entries.sort(
		(a, b) =>
			compareIgnored(a, b) ||
			// Match-based priorities are removed above, but the shared comparator
			// still receives an explicit empty signal set to keep its contract uniform.
			comparePriorities(a, b, noQueryPriorities, {
				recent,
				usageScores: usageScores ?? EMPTY_USAGE_SCORES,
				signalsA: EMPTY_MATCH_SIGNALS,
				signalsB: EMPTY_MATCH_SIGNALS,
			}) ||
			compareFallback(a, b),
	);
}

export function sortFileMatches<T extends SortableFileEntry>(
	matches: FileMatch<T>[],
	query: string | undefined,
	recent: ReadonlyMap<string, number>,
	priorities: readonly FileSortPriority[] = DEFAULT_FILE_SORT_PRIORITIES,
	usageScores?: ReadonlyMap<string, number>,
): T[] {
	// Extract once before sorting so the comparator only compares stable signals;
	// this keeps the compatibility boundary cheap when a vault has many matches.
	const signalsByMatch = new Map(
		matches.map((match) => [match, extractFileMatchSignals(match)] as const),
	);
	return matches
		.sort((a, b) => {
			const signalsA = signalsByMatch.get(a);
			const signalsB = signalsByMatch.get(b);
			if (!signalsA || !signalsB) return 0;
			return (
				compareIgnored(a.obj, b.obj) ||
				compareContiguousMatch(signalsA.contiguousMatch, signalsB.contiguousMatch) ||
				comparePriorities(a.obj, b.obj, priorities, {
					query,
					recent,
					usageScores: usageScores ?? EMPTY_USAGE_SCORES,
					signalsA,
					signalsB,
				}) ||
				compareFallback(a.obj, b.obj)
			);
		})
		.map(({ obj }) => obj);
}
