import { getLinkpath, normalizePath, type App, type CachedMetadata } from "obsidian";
import type {
	AuditExclusions,
	AuditFile,
	AuditSnapshot,
	UnresolvedLinkOccurrence,
} from "src/audit/vaultAudit";
import { isMocOnly } from "src/moc-relateds/mocRelatedsCore";
import { getUserIgnoreFilters } from "src/ignored-notes/ignoredPaths";
import { getCorePluginFolder, isExtensionOpenable } from "src/platform/obsidianInternals";
import type { MyPaletteSettings } from "src/settings/model";

/** Reads what `vaultAudit.ts` judges from the vault and the metadata cache. */
export async function collectAuditSnapshot(app: App): Promise<AuditSnapshot> {
	const { metadataCache, vault } = app;
	const files = await Promise.all(
		vault.getFiles().map(async (file): Promise<AuditFile> => {
			const cache = metadataCache.getFileCache(file);
			const written = file.extension === "md" && cache ? hasContent(cache) : undefined;
			// Why: only notes with a MOC heading are read, so this stays cheap on large vaults.
			const mocOnly =
				written && cache && hasMocHeading(cache)
					? isMocOnly(await vault.cachedRead(file))
					: false;
			return {
				path: file.path,
				extension: file.extension.toLocaleLowerCase(),
				size: file.stat.size,
				mtime: file.stat.mtime,
				openable: isExtensionOpenable(app, file.extension),
				...(written === undefined ? {} : { hasContent: written }),
				...(mocOnly ? { mocOnly } : {}),
			};
		}),
	);
	return {
		files,
		folders: vault.getAllFolders(false).map((folder) => folder.path),
		resolvedLinks: metadataCache.resolvedLinks,
		unresolvedLinks: collectUnresolvedLinks(app),
	};
}

/**
 * Obsidian's Excluded files and this plugin's Excluded folders, lifted together by
 * "Include Obsidian-excluded files" as in File search. Daily notes and Templates stay out of
 * Orphaned files either way: they are rarely linked by nature, not hidden by the user.
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

/** The `## MOC` heading that `analyzeMocOnly` looks for. */
export function hasMocHeading(cache: CachedMetadata): boolean {
	return (cache.headings ?? []).some(
		({ level, heading }) => level === 2 && heading.trim().startsWith("MOC"),
	);
}

function hasContent(cache: CachedMetadata): boolean {
	return (cache.sections ?? []).some((section) => section.type !== "yaml");
}

/**
 * `unresolvedLinks` only counts links per note, so the notes it names are read again for
 * the line of each link.
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
			// Why: a link to a heading in the same note (`[[#heading]]`) has no file to find.
			if (!link || metadataCache.getFirstLinkpathDest(link, source)) return [];
			return [
				"position" in reference
					? { source, link, line: reference.position.start.line }
					: { source, link },
			];
		});
	});
}

/** The folders of the Daily notes and Templates core plugins, when they are on. */
function dailyNoteAndTemplateFolders(app: App): string[] {
	const folders = ["daily-notes", "templates"].map((id) => getCorePluginFolder(app, id));
	return folders.flatMap((folder) => {
		const normalized = folder ? normalizePath(folder) : "";
		// Why: an unset folder means the vault root, and excluding the root would hide everything.
		return normalized && normalized !== "/" ? [normalized] : [];
	});
}
