import { getLinkpath, normalizePath, type App, type CachedMetadata } from "obsidian";
import {
	runAudit,
	type AuditExclusions,
	type AuditFile,
	type AuditKind,
	type AuditReport,
	type AuditSnapshot,
	type UnresolvedLinkOccurrence,
} from "src/audit/vaultAudit";
import { isMocOnly } from "src/moc-relateds/mocRelatedsCore";
import { getUserIgnoreFilters } from "src/ignored-notes/ignoredPaths";
import { getCorePluginFolder, isExtensionOpenable } from "src/platform/obsidianInternals";
import type { MyPaletteSettings } from "src/settings/model";

/** 今の Vault に対して1種類の監査を実行する。除外は設定から読む。 */
export async function auditVault(
	app: App,
	kind: AuditKind,
	settings: MyPaletteSettings,
	includeExcluded = false,
): Promise<AuditReport> {
	return runAudit(
		kind,
		await collectAuditSnapshot(app, kind),
		auditExclusions(app, settings, includeExcluded),
	);
}

/**
 * `vaultAudit.ts` が判定する材料を、Vault とメタデータキャッシュから読む。`kind` に必要なものだけを
 * 読み、残りは空のままにする。そのため、スナップショットは同じ種類で `runAudit` に渡す。
 */
export async function collectAuditSnapshot(app: App, kind: AuditKind): Promise<AuditSnapshot> {
	const { metadataCache, vault } = app;
	// Why: 空のフォルダーにはどの種類のファイルもないので、ファイルを開けるかどうかは関係ない。
	const judgesFiles = kind !== "empty-folders";
	const judgesContent = kind === "empty-files";
	const openable = openableExtensions(app);
	const files = await Promise.all(
		vault.getFiles().map(async (file): Promise<AuditFile> => {
			const cache = judgesContent ? metadataCache.getFileCache(file) : null;
			const written = file.extension === "md" && cache ? hasContent(cache) : undefined;
			// Why: MOC の見出しがあるノートだけを読むので、大きな Vault でも軽いままにする。
			const mocOnly =
				written && cache && hasMocHeading(cache)
					? isMocOnly(await vault.cachedRead(file))
					: false;
			return {
				path: file.path,
				extension: file.extension.toLocaleLowerCase(),
				size: file.stat.size,
				mtime: file.stat.mtime,
				openable: judgesFiles && openable(file.extension),
				...(written === undefined ? {} : { hasContent: written }),
				...(mocOnly ? { mocOnly } : {}),
			};
		}),
	);
	return {
		files,
		folders: judgesFiles ? [] : vault.getAllFolders(false).map((folder) => folder.path),
		resolvedLinks: kind === "orphaned-files" ? metadataCache.resolvedLinks : {},
		unresolvedLinks: kind === "broken-links" ? collectUnresolvedLinks(app) : [],
	};
}

/**
 * Obsidian の除外ファイルと、このプラグインの除外フォルダーをまとめて扱う。ファイル検索と同じく
 * 「Obsidian の除外ファイルを表示」で両方とも外せる。デイリーノートとテンプレートは、どちらの場合も
 * 「浮いたファイル」から外す。これらは性質上リンクされないことが多く、ユーザーが隠したわけではないため。
 */
export function auditExclusions(
	app: App,
	settings: MyPaletteSettings,
	includeExcluded = false,
): AuditExclusions {
	return {
		folders: includeExcluded
			? []
			: [...getUserIgnoreFilters(app), ...settings.file.excludedFolders],
		orphanFolders: dailyNoteAndTemplateFolders(app),
	};
}

/** `analyzeMocOnly` が探す `## MOC` の見出し。 */
export function hasMocHeading(cache: CachedMetadata): boolean {
	return (cache.headings ?? []).some(
		({ level, heading }) => level === 2 && heading.trim().startsWith("MOC"),
	);
}

function hasContent(cache: CachedMetadata): boolean {
	return (cache.sections ?? []).some((section) => section.type !== "yaml");
}

/**
 * `unresolvedLinks` はノートごとのリンク数しか持たないので、名前の挙がったノートを読み直して
 * 各リンクの行を取る。キーはリンクが書かれたままのパスなので、リンクがそのどれかに一致すれば壊れている。
 * 改めて解決する必要はない。
 */
function collectUnresolvedLinks(app: App): UnresolvedLinkOccurrence[] {
	const { metadataCache } = app;
	return Object.entries(metadataCache.unresolvedLinks).flatMap(([source, links]) => {
		if (Object.keys(links).length === 0) return [];
		const cache = metadataCache.getCache(source);
		if (!cache) return [];
		const references = [
			...(cache.links ?? []),
			...(cache.embeds ?? []),
			...(cache.frontmatterLinks ?? []),
		];
		return references.flatMap((reference): UnresolvedLinkOccurrence[] => {
			const link = getLinkpath(reference.link);
			// Why: 同じノート内の見出しへのリンク(`[[#見出し]]`)は、探すべきファイルがない。
			if (!link || !(link in links)) return [];
			return [
				"position" in reference
					? { source, link, line: reference.position.start.line }
					: { source, link },
			];
		});
	});
}

/** 拡張子ごとに Obsidian へ一度だけ問い合わせる。Vault は少ない拡張子の多くのファイルを持つため。 */
function openableExtensions(app: App): (extension: string) => boolean {
	const known = new Map<string, boolean>();
	return (extension) => {
		const cached = known.get(extension);
		if (cached !== undefined) return cached;
		const openable = isExtensionOpenable(app, extension);
		known.set(extension, openable);
		return openable;
	};
}

/** デイリーノートとテンプレートのコアプラグインが有効なら、そのフォルダー。 */
function dailyNoteAndTemplateFolders(app: App): string[] {
	const folders = ["daily-notes", "templates"].map((id) => getCorePluginFolder(app, id));
	return folders.flatMap((folder) => {
		const normalized = folder ? normalizePath(folder) : "";
		// Why: フォルダーが未設定なら Vault のルートを指すので、ルートを除外するとすべて隠れてしまう。
		return normalized && normalized !== "/" ? [normalized] : [];
	});
}
