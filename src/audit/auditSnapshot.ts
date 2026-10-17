import { getAllTags, getLinkpath, normalizePath, type App, type CachedMetadata } from "obsidian";
import type {
	AuditExclusions,
	AuditSnapshot,
	UnresolvedLinkOccurrence,
} from "src/audit/vaultAudit";
import { getUserIgnoreFilters } from "src/ignored-notes/ignoredPaths";
import type { MyPaletteSettings } from "src/settings/model";

/** Reads what `vaultAudit.ts` judges from the vault and the metadata cache. */
export function collectAuditSnapshot(app: App): AuditSnapshot {
	const { metadataCache, vault } = app;
	const files = vault.getFiles().map((file) => {
		const cache = metadataCache.getFileCache(file);
		return {
			path: file.path,
			extension: file.extension.toLocaleLowerCase(),
			size: file.stat.size,
			mtime: file.stat.mtime,
			tags: cache ? (getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, "")) : [],
			...(file.extension === "md" && cache ? { hasContent: hasContent(cache) } : {}),
		};
	});
	return {
		files,
		folders: vault.getAllFolders(false).map((folder) => folder.path),
		resolvedLinks: metadataCache.resolvedLinks,
		unresolvedLinks: collectUnresolvedLinks(app),
	};
}

export function auditExclusions(app: App, settings: MyPaletteSettings): AuditExclusions {
	return {
		folders: [
			...getUserIgnoreFilters(app),
			...settings.file.excludedFolders,
			...settings.audit.excludedFolders,
		],
		tags: settings.audit.excludedTags,
		extensions: settings.audit.excludedExtensions,
		orphanFolders: settings.audit.excludeDailyNotesAndTemplates
			? dailyNoteAndTemplateFolders(app)
			: [],
	};
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

/** Only the part of a core plugin instance read here; the settings are not public API. */
interface FolderOptionPlugin {
	options?: { folder?: unknown };
}

/** The folders of the Daily notes and Templates core plugins, when they are on. */
function dailyNoteAndTemplateFolders(app: App): string[] {
	const plugins = app.internalPlugins as unknown as {
		getEnabledPluginById(id: string): FolderOptionPlugin | null;
	};
	const folders = ["daily-notes", "templates"].map(
		(id) => plugins.getEnabledPluginById(id)?.options?.folder,
	);
	return folders.flatMap((folder) => {
		const normalized = typeof folder === "string" && folder ? normalizePath(folder) : "";
		// Why: an unset folder means the vault root, and excluding the root would hide everything.
		return normalized && normalized !== "/" ? [normalized] : [];
	});
}
