import {
	DEFAULT_FILE_SORT_PRIORITIES,
	parseFileSortPriority,
	type FileSortPriority,
} from "src/model/settings";

export interface SortableFileEntry {
	path: string;
	basename: string;
	aliases: string[];
	mtime: number;
	/** Parsed numeric value of the Vault's `prior` frontmatter property. */
	prior?: number;
	ignored?: boolean;
}

export interface FileMatch<T extends SortableFileEntry> {
	obj: T;
	score: number;
	/** Fuzzy score contributed by the file's basename, when it matched. */
	filenameScore?: number;
	/** Fuzzy score contributed by the file's aliases, when they matched. */
	aliasScore?: number;
	/** Fuzzy score contributed by the file's path, when it matched. */
	pathScore?: number;
}

interface SortContext {
	query?: string;
	recent: ReadonlyMap<string, number>;
	filenameScoreA?: number;
	filenameScoreB?: number;
	aliasScoreA?: number;
	aliasScoreB?: number;
	pathScoreA?: number;
	pathScoreB?: number;
}

const QUERY_SORT_PRIORITIES = new Set<FileSortPriority>([
	"Filename prefix match",
	"Alias prefix match",
	"Filename fuzzy match",
	"Alias fuzzy match",
	"Path fuzzy match",
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
		case "Filename prefix match":
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query, "filename")) -
						Number(hasPrefixMatch(a, context.query, "filename"));
		case "Alias prefix match":
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query, "alias")) -
						Number(hasPrefixMatch(a, context.query, "alias"));
		case "Filename fuzzy match":
			return compareOptionalScore(context.filenameScoreA, context.filenameScoreB);
		case "Alias fuzzy match":
			return compareOptionalScore(context.aliasScoreA, context.aliasScoreB);
		case "Path fuzzy match":
			return compareOptionalScore(context.pathScoreA, context.pathScoreB);
		case "Last opened":
			return compareRecent(a, b, context.recent);
		case "Last modified":
			return compareNumber(a.mtime, b.mtime, "desc");
		case "Aliases count":
			// Alias count is a derived centrality signal, not the first alias value;
			// keep it opt-in so a few heavily aliased notes do not dominate by default.
			return compareNumber(a.aliases.length, b.aliases.length, "desc");
		case "Alphabetical":
			return compareAlphabetical(a, b);
		case "Alphabetical reverse":
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
): T[] {
	const noQueryPriorities = filterNoQueryPriorities(priorities);
	return entries.sort(
		(a, b) =>
			compareIgnored(a, b) ||
			comparePriorities(a, b, noQueryPriorities, { recent }) ||
			compareFallback(a, b),
	);
}

export function sortFileMatches<T extends SortableFileEntry>(
	matches: FileMatch<T>[],
	query: string,
	recent: ReadonlyMap<string, number>,
	priorities: readonly FileSortPriority[] = DEFAULT_FILE_SORT_PRIORITIES,
): T[] {
	return matches
		.sort((a, b) => {
			const filenameScoreA = Object.prototype.hasOwnProperty.call(a, "filenameScore")
				? a.filenameScore
				: a.score;
			const filenameScoreB = Object.prototype.hasOwnProperty.call(b, "filenameScore")
				? b.filenameScore
				: b.score;
			const aliasScoreA = Object.prototype.hasOwnProperty.call(a, "aliasScore")
				? a.aliasScore
				: undefined;
			const aliasScoreB = Object.prototype.hasOwnProperty.call(b, "aliasScore")
				? b.aliasScore
				: undefined;
			const pathScoreA = Object.prototype.hasOwnProperty.call(a, "pathScore")
				? a.pathScore
				: undefined;
			const pathScoreB = Object.prototype.hasOwnProperty.call(b, "pathScore")
				? b.pathScore
				: undefined;
			return (
				compareIgnored(a.obj, b.obj) ||
				comparePriorities(a.obj, b.obj, priorities, {
					query,
					recent,
					filenameScoreA,
					filenameScoreB,
					aliasScoreA,
					aliasScoreB,
					pathScoreA,
					pathScoreB,
				}) ||
				compareFallback(a.obj, b.obj)
			);
		})
		.map(({ obj }) => obj);
}
