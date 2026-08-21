export interface SortableFileEntry {
	path: string;
	basename: string;
	aliases: string[];
	mtime: number;
	ignored?: boolean;
}

export interface FileMatch<T extends SortableFileEntry> {
	obj: T;
	score: number;
}

function normalized(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function hasPrefixMatch(entry: SortableFileEntry, query: string): boolean {
	const needle = normalized(query);
	return [entry.basename, ...entry.aliases].some((value) => normalized(value).startsWith(needle));
}

function compareRecent(
	a: SortableFileEntry,
	b: SortableFileEntry,
	recent: ReadonlyMap<string, number>,
): number {
	return (
		(recent.get(a.path) ?? Number.POSITIVE_INFINITY) -
		(recent.get(b.path) ?? Number.POSITIVE_INFINITY)
	);
}

function compareFallback(a: SortableFileEntry, b: SortableFileEntry): number {
	return (
		b.mtime - a.mtime ||
		a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" }) ||
		a.path.localeCompare(b.path, undefined, { sensitivity: "base" })
	);
}

function compareIgnored(a: SortableFileEntry, b: SortableFileEntry): number {
	// The include-ignored prefix is an explicit request to inspect archived notes,
	// so those candidates should be visible before the much larger normal set.
	return Number(Boolean(b.ignored)) - Number(Boolean(a.ignored));
}

export function sortFilesWithoutQuery<T extends SortableFileEntry>(
	entries: T[],
	recent: ReadonlyMap<string, number>,
): T[] {
	return entries.sort(
		(a, b) => compareIgnored(a, b) || compareRecent(a, b, recent) || compareFallback(a, b),
	);
}

export function sortFileMatches<T extends SortableFileEntry>(
	matches: FileMatch<T>[],
	query: string,
	recent: ReadonlyMap<string, number>,
): T[] {
	return matches
		.sort(
			(a, b) =>
				compareIgnored(a.obj, b.obj) ||
				Number(hasPrefixMatch(b.obj, query)) - Number(hasPrefixMatch(a.obj, query)) ||
				b.score - a.score ||
				compareRecent(a.obj, b.obj, recent) ||
				compareFallback(a.obj, b.obj),
		)
		.map(({ obj }) => obj);
}
