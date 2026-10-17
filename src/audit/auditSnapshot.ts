import { getAllTags, getLinkpath, normalizePath, type App, type CachedMetadata } from "obsidian";
import {
	runAudit,
	type AuditExclusions,
	type AuditFile,
	type AuditKind,
	type AuditReport,
	type AuditSnapshot,
	type UnresolvedLinkOccurrence,
} from "src/audit/vaultAudit";
import { analyzeMocOnly } from "src/moc-relateds/mocRelatedsCore";
import { getUserIgnoreFilters } from "src/ignored-notes/ignoredPaths";
import { getCorePluginFolder, isExtensionOpenable } from "src/platform/obsidianInternals";
import type { MyPaletteSettings } from "src/settings/model";

/** Runs one kind of audit on the vault as it is now, with the exclusions from the settings. */
export async function auditVault(
	app: App,
	kind: AuditKind,
	settings: MyPaletteSettings,
): Promise<AuditReport> {
	return runAudit(
		kind,
		await collectAuditSnapshot(app, kind, settings.audit),
		auditExclusions(app, settings),
	);
}

export interface AuditSnapshotOptions {
	/** Read notes with a MOC section to find those holding nothing else. */
	mocOnlyAsEmpty: boolean;
}

/**
 * Reads what `vaultAudit.ts` judges from the vault and the metadata cache. Only what `kind`
 * needs is read; the rest stays empty, so pass the snapshot to `runAudit` with the same kind.
 */
export async function collectAuditSnapshot(
	app: App,
	kind: AuditKind,
	{ mocOnlyAsEmpty }: AuditSnapshotOptions,
): Promise<AuditSnapshot> {
	const { metadataCache, vault } = app;
	// Why: an empty folder holds no file of any kind, so its files' tags and contents do not matter.
	const judgesFiles = kind !== "empty-folders";
	const judgesContent = kind === "empty-files";
	const openable = openableExtensions(app);
	const files = await Promise.all(
		vault.getFiles().map(async (file): Promise<AuditFile> => {
			const cache = judgesFiles ? metadataCache.getFileCache(file) : null;
			const written =
				judgesContent && file.extension === "md" && cache ? hasContent(cache) : undefined;
			// Why: only notes with a MOC heading are read, so the option stays cheap on large vaults.
			const moc =
				mocOnlyAsEmpty && written && cache && hasMocHeading(cache)
					? analyzeMocOnly(await vault.cachedRead(file))
					: undefined;
			return {
				path: file.path,
				extension: file.extension.toLocaleLowerCase(),
				size: file.stat.size,
				mtime: file.stat.mtime,
				tags: cache ? (getAllTags(cache) ?? []).map((tag) => tag.replace(/^#/, "")) : [],
				openable: judgesFiles && openable(file.extension),
				...(written === undefined ? {} : { hasContent: written }),
				...(moc?.mocOnly ? { mocOnly: { references: moc.references } } : {}),
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

export function auditExclusions(app: App, settings: MyPaletteSettings): AuditExclusions {
	return {
		folders: [
			...getUserIgnoreFilters(app),
			...settings.file.excludedFolders,
			...settings.audit.excludedFolders,
			// Why: archived files are kept on purpose; listing them again would undo the archive.
			...(settings.audit.archiveFolder ? [settings.audit.archiveFolder] : []),
		],
		tags: settings.audit.excludedTags,
		extensions: settings.audit.excludedExtensions,
		orphanFolders: settings.audit.excludeDailyNotesAndTemplates
			? dailyNoteAndTemplateFolders(app)
			: [],
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
 * the line of each link. Its keys are the link paths as written, so a link is broken when
 * its path is one of them; nothing has to be resolved again.
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
			if (!link || !(link in links)) return [];
			return [
				"position" in reference
					? { source, link, line: reference.position.start.line }
					: { source, link },
			];
		});
	});
}

/** Asks Obsidian once per extension; a vault holds many files of few extensions. */
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

/** The folders of the Daily notes and Templates core plugins, when they are on. */
function dailyNoteAndTemplateFolders(app: App): string[] {
	const folders = ["daily-notes", "templates"].map((id) => getCorePluginFolder(app, id));
	return folders.flatMap((folder) => {
		const normalized = folder ? normalizePath(folder) : "";
		// Why: an unset folder means the vault root, and excluding the root would hide everything.
		return normalized && normalized !== "/" ? [normalized] : [];
	});
}
