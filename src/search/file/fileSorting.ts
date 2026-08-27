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
}

interface SortContext {
	query?: string;
	recent: ReadonlyMap<string, number>;
	scoreA?: number;
	scoreB?: number;
}

const QUERY_SORT_PRIORITIES = new Set<FileSortPriority>(["Prefix name match", "Fuzzy name match"]);

function normalized(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function hasPrefixMatch(entry: SortableFileEntry, query: string): boolean {
	const needle = normalized(query);
	return [entry.basename, ...entry.aliases].some((value) => normalized(value).startsWith(needle));
}

function compareNumber(a: number, b: number, order: "asc" | "desc" = "asc"): number {
	if (a === b) return 0;
	const result = a < b ? -1 : 1;
	return order === "asc" ? result : -result;
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
		case "Prefix name match":
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query)) -
						Number(hasPrefixMatch(a, context.query));
		case "Fuzzy name match":
			return (context.scoreB ?? 0) - (context.scoreA ?? 0);
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
		.sort(
			(a, b) =>
				compareIgnored(a.obj, b.obj) ||
				comparePriorities(a.obj, b.obj, priorities, {
					query,
					recent,
					scoreA: a.score,
					scoreB: b.score,
				}) ||
				compareFallback(a.obj, b.obj),
		)
		.map(({ obj }) => obj);
}
