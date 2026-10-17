import { isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPathMatching";

/**
 * Vault audit judgement, kept free of Obsidian so the palette mode and the CLI share one
 * tested definition of "orphaned", "broken" and "empty". `auditSnapshot.ts` reads the vault.
 */

export const AUDIT_KINDS = [
	"orphaned-files",
	"broken-links",
	"empty-files",
	"empty-folders",
] as const;

export type AuditKind = (typeof AUDIT_KINDS)[number];

export function isAuditKind(value: unknown): value is AuditKind {
	return typeof value === "string" && (AUDIT_KINDS as readonly string[]).includes(value);
}

export interface AuditFile {
	path: string;
	/** Lower case, without the dot. */
	extension: string;
	size: number;
	mtime: number;
	/** Tags without `#`, from the frontmatter and the body. */
	tags: readonly string[];
	/**
	 * Whether Obsidian can open the file. Orphaned and empty files list only these: a
	 * config file such as `cog.toml` is never linked and is not the user's to tidy here.
	 */
	openable: boolean;
	/**
	 * Markdown only: whether anything but frontmatter is in the note. Undefined when the
	 * metadata cache has not indexed the note, so the size decides instead.
	 */
	hasContent?: boolean;
	/**
	 * Set only when MOC-only notes count as empty: the note holds nothing but frontmatter
	 * and its MOC section, whose References has this many entries.
	 */
	mocOnly?: { references: number };
}

/** One link or embed whose target does not exist. */
export interface UnresolvedLinkOccurrence {
	source: string;
	/** The link path without its heading or block part, as written. */
	link: string;
	/** Zero-based. Undefined for links in the frontmatter. */
	line?: number;
}

export interface AuditSnapshot {
	files: readonly AuditFile[];
	/** Every folder except the vault root. */
	folders: readonly string[];
	/** `metadataCache.resolvedLinks`: source path → target path → count. */
	resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>;
	unresolvedLinks: readonly UnresolvedLinkOccurrence[];
}

export interface AuditExclusions {
	/** Path filters in Obsidian's Excluded files format (folder paths or `/regex/`). */
	folders: readonly string[];
	/** Tags without `#`. A tag also excludes its nested tags. */
	tags: readonly string[];
	/** Lower case, without the dot. */
	extensions: readonly string[];
	/** Extra path filters applied only to orphaned files (Daily notes, Templates). */
	orphanFolders: readonly string[];
}

export const NO_AUDIT_EXCLUSIONS: AuditExclusions = {
	folders: [],
	tags: [],
	extensions: [],
	orphanFolders: [],
};

export interface AuditFileItem {
	path: string;
	size: number;
	mtime: number;
	/** Empty files only: the note has a MOC section, with this many References entries. */
	mocOnly?: { references: number };
}

export interface BrokenLinkSource {
	path: string;
	line?: number;
}

export interface BrokenLinkItem {
	link: string;
	sources: BrokenLinkSource[];
}

export interface EmptyFolderItem {
	path: string;
	/** Empty folders nested inside, which go with this one when it is removed. */
	foldersInside: number;
}

export type AuditReport =
	| { kind: "orphaned-files"; items: AuditFileItem[] }
	| { kind: "broken-links"; items: BrokenLinkItem[] }
	| { kind: "empty-files"; items: AuditFileItem[] }
	| { kind: "empty-folders"; items: EmptyFolderItem[] };

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function runAudit(
	kind: AuditKind,
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions = NO_AUDIT_EXCLUSIONS,
): AuditReport {
	switch (kind) {
		case "orphaned-files":
			return { kind, items: findOrphanedFiles(snapshot, exclusions) };
		case "broken-links":
			return { kind, items: findBrokenLinks(snapshot, exclusions) };
		case "empty-files":
			return { kind, items: findEmptyFiles(snapshot, exclusions) };
		case "empty-folders":
			return { kind, items: findEmptyFolders(snapshot, exclusions) };
	}
}

/** Keeps the items whose path matches; for broken links, the linking notes' paths. */
export function filterAuditReport(
	report: AuditReport,
	isMatch: (path: string) => boolean,
): AuditReport {
	switch (report.kind) {
		case "broken-links":
			return {
				kind: report.kind,
				items: report.items
					.map((item) => ({
						...item,
						sources: item.sources.filter(({ path }) => isMatch(path)),
					}))
					.filter((item) => item.sources.length > 0),
			};
		case "empty-folders":
			return { kind: report.kind, items: report.items.filter(({ path }) => isMatch(path)) };
		case "orphaned-files":
		case "empty-files":
			return { kind: report.kind, items: report.items.filter(({ path }) => isMatch(path)) };
	}
}

export function findOrphanedFiles(
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions,
): AuditFileItem[] {
	const linked = new Set<string>();
	for (const [source, targets] of Object.entries(snapshot.resolvedLinks)) {
		for (const target of Object.keys(targets)) {
			// Why: a note that only links to itself is still unreachable from the rest of the vault.
			if (target !== source) linked.add(target);
		}
	}
	return sortByPath(
		snapshot.files
			.filter((file) => file.openable && !linked.has(file.path))
			.filter((file) => !isExcludedFile(file, exclusions))
			.filter((file) => !isUserIgnoredPathWithFilters(exclusions.orphanFolders, file.path))
			.map(toFileItem),
	);
}

export function findBrokenLinks(
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions,
): BrokenLinkItem[] {
	const filesByPath = new Map(snapshot.files.map((file) => [file.path, file]));
	const sourcesByLink = new Map<string, BrokenLinkSource[]>();
	for (const { source, link, line } of snapshot.unresolvedLinks) {
		const file = filesByPath.get(source);
		if (!file || isExcludedFile(file, exclusions)) continue;
		const sources = sourcesByLink.get(link) ?? [];
		sources.push(line === undefined ? { path: source } : { path: source, line });
		sourcesByLink.set(link, sources);
	}
	return [...sourcesByLink]
		.map(([link, sources]) => ({ link, sources: sources.sort(compareSources) }))
		.sort((a, b) => b.sources.length - a.sources.length || collator.compare(a.link, b.link));
}

export function findEmptyFiles(
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions,
): AuditFileItem[] {
	return sortByPath(
		snapshot.files
			.filter((file) => file.openable && isEmptyFile(file))
			.filter((file) => !isExcludedFile(file, exclusions))
			.map(toEmptyFileItem),
	);
}

export function findEmptyFolders(
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions,
): EmptyFolderItem[] {
	// Why: any file counts, excluded or not, because removing the folder would remove it too.
	const holdingFiles = new Set(snapshot.files.flatMap((file) => ancestorFolders(file.path)));
	const empty = snapshot.folders.filter((folder) => !holdingFiles.has(folder));
	const emptySet = new Set(empty);
	return empty
		.filter((folder) => !emptySet.has(parentFolder(folder)))
		.filter((folder) => !isUserIgnoredPathWithFilters(exclusions.folders, folder))
		.map((path) => ({
			path,
			foldersInside: empty.filter((other) => other.startsWith(`${path}/`)).length,
		}))
		.sort((a, b) => collator.compare(a.path, b.path));
}

function isEmptyFile(file: AuditFile): boolean {
	if (file.mocOnly) return true;
	if (file.extension === "md" && file.hasContent !== undefined) return !file.hasContent;
	return file.size === 0;
}

function isExcludedFile(file: AuditFile, exclusions: AuditExclusions): boolean {
	return (
		isUserIgnoredPathWithFilters(exclusions.folders, file.path) ||
		exclusions.extensions.includes(file.extension) ||
		file.tags.some((tag) => hasExcludedTag(tag, exclusions.tags))
	);
}

function hasExcludedTag(tag: string, excluded: readonly string[]): boolean {
	const normalized = tag.toLocaleLowerCase();
	return excluded.some((value) => {
		const target = value.toLocaleLowerCase();
		return normalized === target || normalized.startsWith(`${target}/`);
	});
}

function ancestorFolders(path: string): string[] {
	const parts = path.split("/").slice(0, -1);
	return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

function parentFolder(path: string): string {
	const index = path.lastIndexOf("/");
	return index < 0 ? "" : path.slice(0, index);
}

function toFileItem({ path, size, mtime }: AuditFile): AuditFileItem {
	return { path, size, mtime };
}

function toEmptyFileItem(file: AuditFile): AuditFileItem {
	return file.mocOnly ? { ...toFileItem(file), mocOnly: file.mocOnly } : toFileItem(file);
}

function sortByPath<T extends { path: string }>(items: T[]): T[] {
	return items.sort((a, b) => collator.compare(a.path, b.path));
}

function compareSources(a: BrokenLinkSource, b: BrokenLinkSource): number {
	return collator.compare(a.path, b.path) || (a.line ?? -1) - (b.line ?? -1);
}
