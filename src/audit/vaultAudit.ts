import { createUserIgnoredPathMatcher } from "src/ignored-notes/ignoredPathMatching";

/**
 * Vault 監査の判定。Obsidian に依存しないように保ち、パレットのモードと CLI が
 * 「浮いた」「壊れた」「空」の同じ定義を共有してテストできるようにする。
 * `auditSnapshot.ts` が Vault を読む。
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
	/** 小文字で、ドットを含まない。 */
	extension: string;
	size: number;
	mtime: number;
	/**
	 * Obsidian がファイルを開けるかどうか。浮いたファイルと空のファイルは、開けるものだけを
	 * 一覧にする。`cog.toml` のような設定ファイルはリンクされないのが普通で、ここで整理するものではないため。
	 */
	openable: boolean;
	/**
	 * Markdown だけ: フロントマター以外の中身があるかどうか。メタデータキャッシュがそのノートを
	 * まだ索引していない場合は undefined になり、代わりにサイズで判定する。
	 */
	hasContent?: boolean;
	/** Markdown だけ: フロントマターと MOC の節以外に何もないノート。 */
	mocOnly?: boolean;
}

/** 存在しないファイルを指す、リンクまたは埋め込み1つ。 */
export interface UnresolvedLinkOccurrence {
	source: string;
	/** 見出しやブロックの部分を除いた、書かれたままのリンクのパス。 */
	link: string;
	/** 0始まり。フロントマター内のリンクは undefined。 */
	line?: number;
}

export interface AuditSnapshot {
	files: readonly AuditFile[];
	/** Vault のルートを除く、すべてのフォルダー。 */
	folders: readonly string[];
	/** `metadataCache.resolvedLinks`: 元のパス → 先のパス → 件数。 */
	resolvedLinks: Readonly<Record<string, Readonly<Record<string, number>>>>;
	unresolvedLinks: readonly UnresolvedLinkOccurrence[];
}

export interface AuditExclusions {
	/** Obsidian の「除外ファイル」の形式のパスフィルター(フォルダーのパスまたは `/正規表現/`)。 */
	folders: readonly string[];
	/** 浮いたファイルにだけ適用する追加のパスフィルター(デイリーノート、テンプレート)。 */
	orphanFolders: readonly string[];
}

export const NO_AUDIT_EXCLUSIONS: AuditExclusions = {
	folders: [],
	orphanFolders: [],
};

export interface AuditFileItem {
	path: string;
	size: number;
	mtime: number;
	/** 空のファイルだけ: ノートに MOC の節があり、空白ではないことを示す。 */
	mocOnly?: true;
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
	/** 中に入っている空のフォルダー。このフォルダーを削除すると一緒に消える。 */
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

/** パスが一致する項目だけを残す。壊れたリンクは、リンクしているノートのパスで判定する。 */
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
	const isExcluded = createUserIgnoredPathMatcher(exclusions.folders);
	const isOrphanFolder = createUserIgnoredPathMatcher(exclusions.orphanFolders);
	const linked = new Set<string>();
	for (const [source, targets] of Object.entries(snapshot.resolvedLinks)) {
		for (const target of Object.keys(targets)) {
			// Why: 自分自身にだけリンクしているノートも、Vault の残りからは到達できないままなので数えない。
			if (target !== source) linked.add(target);
		}
	}
	return sortByPath(
		snapshot.files
			.filter((file) => file.openable && !linked.has(file.path))
			.filter((file) => !isExcluded(file.path) && !isOrphanFolder(file.path))
			.map(toFileItem),
	);
}

export function findBrokenLinks(
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions,
): BrokenLinkItem[] {
	const isExcluded = createUserIgnoredPathMatcher(exclusions.folders);
	const filesByPath = new Map(snapshot.files.map((file) => [file.path, file]));
	const sourcesByLink = new Map<string, BrokenLinkSource[]>();
	for (const { source, link, line } of snapshot.unresolvedLinks) {
		const file = filesByPath.get(source);
		if (!file || isExcluded(file.path)) continue;
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
	const isExcluded = createUserIgnoredPathMatcher(exclusions.folders);
	return sortByPath(
		snapshot.files
			.filter((file) => file.openable && isEmptyFile(file) && !isExcluded(file.path))
			.map(toEmptyFileItem),
	);
}

export function findEmptyFolders(
	snapshot: AuditSnapshot,
	exclusions: AuditExclusions,
): EmptyFolderItem[] {
	// Why: 除外されているかどうかにかかわらず、どのファイルも数える。フォルダーを消すと、そのファイルも消えるため。
	const holdingFiles = new Set(snapshot.files.flatMap((file) => ancestorFolders(file.path)));
	const empty = snapshot.folders.filter((folder) => !holdingFiles.has(folder));
	const emptySet = new Set(empty);
	const isExcluded = createUserIgnoredPathMatcher(exclusions.folders);
	return empty
		.filter((folder) => !emptySet.has(parentFolder(folder)))
		.filter((folder) => !isExcluded(folder))
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
	return file.mocOnly ? { ...toFileItem(file), mocOnly: true } : toFileItem(file);
}

function sortByPath<T extends { path: string }>(items: T[]): T[] {
	return items.sort((a, b) => collator.compare(a.path, b.path));
}

function compareSources(a: BrokenLinkSource, b: BrokenLinkSource): number {
	return collator.compare(a.path, b.path) || (a.line ?? -1) - (b.line ?? -1);
}
