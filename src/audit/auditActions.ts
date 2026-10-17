import { TFile, TFolder, normalizePath, type App, type TAbstractFile } from "obsidian";
import { noteEmptiness } from "src/audit/noteEmptiness";
import { logger } from "src/shared/logger";
import type { AuditKind } from "src/audit/vaultAudit";
import { removeLinkFromMocRelateds } from "src/moc-relateds/mocRelatedsCore";
import type { AuditSettings } from "src/settings/model";

export type AuditAction = "trash" | "archive";

export interface AuditActionResult {
	path: string;
	outcome: "trashed" | "archived" | "skipped" | "failed";
	reason?: string;
	/** Notes whose MOC Relateds no longer link to a trashed MOC-only note. */
	unlinkedFrom?: string[];
}

export type AuditActionSettings = Pick<AuditSettings, "archiveFolder" | "mocOnlyAsEmpty">;

/** Kinds whose items are files or folders that can be moved; broken links are not. */
export function canTrash(kind: AuditKind): boolean {
	return kind !== "broken-links";
}

/** Archiving keeps a file for later; an empty folder has nothing to keep. */
export function canArchive(kind: AuditKind): boolean {
	return kind === "orphaned-files" || kind === "empty-files";
}

/** Keeps the vault path under the archive folder, so the original place is not lost. */
export function archivePath(archiveFolder: string, path: string): string {
	return normalizePath(`${archiveFolder}/${path}`);
}

/**
 * Moves the items to the trash or the archive folder, one at a time. Each item is checked
 * again first, because the vault may have changed since the list was made.
 */
export async function applyAuditAction(
	app: App,
	action: AuditAction,
	kind: AuditKind,
	paths: readonly string[],
	settings: AuditActionSettings,
): Promise<AuditActionResult[]> {
	if (action === "trash" && !canTrash(kind)) throw new Error(`${kind} cannot be moved to trash.`);
	if (action === "archive" && !canArchive(kind))
		throw new Error(`${kind} cannot be moved to the archive folder.`);
	if (action === "archive" && !settings.archiveFolder)
		throw new Error("Set an archive folder first.");
	// Why: built once for the batch rather than scanning every link per item. Moving files
	// only takes links away, so a stale set can skip an item but never moves a linked one.
	const linked = kind === "orphaned-files" ? linkedFromOtherFiles(app) : new Set<string>();
	const results: AuditActionResult[] = [];
	for (const path of paths) {
		try {
			results.push(await applyToItem(app, action, kind, path, settings, linked));
		} catch (error) {
			logger.error(`Vault audit could not ${action} ${path}`, error);
			results.push({
				path,
				outcome: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}

async function applyToItem(
	app: App,
	action: AuditAction,
	kind: AuditKind,
	path: string,
	settings: AuditActionSettings,
	linked: ReadonlySet<string>,
): Promise<AuditActionResult> {
	const target = app.vault.getAbstractFileByPath(path);
	if (!target) return { path, outcome: "skipped", reason: "No longer exists." };
	const state = await currentState(app, kind, target, settings.mocOnlyAsEmpty, linked);
	if (typeof state === "string") return { path, outcome: "skipped", reason: state };
	if (action === "trash") {
		// Why: a MOC-only note is linked back from its partners' Relateds; trashing it alone
		// would leave those links broken.
		const unlinkedFrom =
			state.mocOnly && target instanceof TFile ? await unlinkFromRelateds(app, target) : [];
		await app.fileManager.trashFile(target);
		return { path, outcome: "trashed", ...(unlinkedFrom.length > 0 ? { unlinkedFrom } : {}) };
	}
	const destination = archivePath(settings.archiveFolder, path);
	if (app.vault.getAbstractFileByPath(destination))
		return { path, outcome: "skipped", reason: "Already exists in the archive folder." };
	await ensureFolder(app, destination.split("/").slice(0, -1).join("/"));
	// Why: renameFile also updates links to the file, which an empty note may still have.
	await app.fileManager.renameFile(target, destination);
	return { path, outcome: "archived" };
}

/** Whether the item still belongs in the list; a string says why it no longer does. */
async function currentState(
	app: App,
	kind: AuditKind,
	target: TAbstractFile,
	mocOnlyAsEmpty: boolean,
	linked: ReadonlySet<string>,
): Promise<{ mocOnly: boolean } | string> {
	const listed = { mocOnly: false };
	switch (kind) {
		case "orphaned-files":
			if (!(target instanceof TFile)) return "Not a file.";
			return linked.has(target.path) ? "Now linked from a note." : listed;
		case "empty-files": {
			if (!(target instanceof TFile)) return "Not a file.";
			const { kind: emptiness } = await noteEmptiness(app, target);
			if (emptiness === "empty") return listed;
			return emptiness === "moc-only" && mocOnlyAsEmpty
				? { mocOnly: true }
				: "No longer empty.";
		}
		case "empty-folders":
			if (!(target instanceof TFolder)) return "Not a folder.";
			return holdsFiles(target) ? "No longer empty." : listed;
		case "broken-links":
			return "Broken links cannot be moved.";
	}
}

/** Removes the note from the MOC Relateds of every note linking to it; returns those notes. */
async function unlinkFromRelateds(app: App, note: TFile): Promise<string[]> {
	const sources = Object.entries(app.metadataCache.resolvedLinks)
		.filter(([source, targets]) => source !== note.path && note.path in targets)
		.map(([source]) => app.vault.getFileByPath(source))
		.filter((source): source is TFile => source !== null);
	const unlinked: string[] = [];
	for (const source of sources) {
		let removed = false;
		await app.vault.process(source, (content) => {
			const result = removeLinkFromMocRelateds(content, note.basename);
			removed = result.success;
			// Why: a link outside Relateds, or one with nested items, is left for the user.
			return result.success ? result.newContent : content;
		});
		if (removed) unlinked.push(source.path);
	}
	return unlinked;
}

/** Every file that another file links to; a link to itself does not count. */
function linkedFromOtherFiles(app: App): Set<string> {
	const linked = new Set<string>();
	for (const [source, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
		for (const target of Object.keys(targets)) if (target !== source) linked.add(target);
	}
	return linked;
}

function holdsFiles(folder: TFolder): boolean {
	return folder.children.some(
		(child) => child instanceof TFile || (child instanceof TFolder && holdsFiles(child)),
	);
}

async function ensureFolder(app: App, path: string): Promise<void> {
	if (!path) return;
	const parts = path.split("/");
	for (let index = 1; index <= parts.length; index++) {
		const folder = parts.slice(0, index).join("/");
		if (!app.vault.getAbstractFileByPath(folder)) await app.vault.createFolder(folder);
	}
}

/** One notice for the whole batch: what moved, and how many were skipped or failed. */
export function describeAuditActionResults(
	action: AuditAction,
	kind: AuditKind,
	results: readonly AuditActionResult[],
): string {
	const count = (outcome: AuditActionResult["outcome"]) =>
		results.filter((result) => result.outcome === outcome).length;
	const noun = kind === "empty-folders" ? "folder" : "file";
	const moved = count(action === "trash" ? "trashed" : "archived");
	const destination = action === "trash" ? "trash" : "the archive folder";
	const parts = [`Moved ${plural(moved, noun)} to ${destination}.`];
	const skipped = count("skipped");
	if (skipped > 0) parts.push(`Skipped ${skipped} that changed since the list was made.`);
	const unlinked = new Set(results.flatMap((result) => result.unlinkedFrom ?? [])).size;
	if (unlinked > 0)
		parts.push(`Removed their links from the Relateds of ${plural(unlinked, "note")}.`);
	const failed = count("failed");
	if (failed > 0) parts.push(`${failed} failed; see the console.`);
	return parts.join(" ");
}

export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
