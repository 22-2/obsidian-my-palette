import {
	TFile,
	TFolder,
	getFrontMatterInfo,
	normalizePath,
	type App,
	type TAbstractFile,
} from "obsidian";
import type { AuditKind } from "src/audit/vaultAudit";

export type AuditAction = "trash" | "archive";

export interface AuditActionResult {
	path: string;
	outcome: "trashed" | "archived" | "skipped" | "failed";
	reason?: string;
}

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
	archiveFolder: string,
): Promise<AuditActionResult[]> {
	if (action === "trash" && !canTrash(kind)) throw new Error(`${kind} cannot be moved to trash.`);
	if (action === "archive" && !canArchive(kind))
		throw new Error(`${kind} cannot be moved to the archive folder.`);
	if (action === "archive" && !archiveFolder) throw new Error("Set an archive folder first.");
	const results: AuditActionResult[] = [];
	for (const path of paths) {
		try {
			results.push(await applyToItem(app, action, kind, path, archiveFolder));
		} catch (error) {
			console.error(`[my-palette] Vault audit could not ${action} ${path}`, error);
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
	archiveFolder: string,
): Promise<AuditActionResult> {
	const target = app.vault.getAbstractFileByPath(path);
	const reason = target ? await whyNoLongerListed(app, kind, target) : "No longer exists.";
	if (reason) return { path, outcome: "skipped", reason };
	if (action === "trash") {
		await app.fileManager.trashFile(target!);
		return { path, outcome: "trashed" };
	}
	const destination = archivePath(archiveFolder, path);
	if (app.vault.getAbstractFileByPath(destination))
		return { path, outcome: "skipped", reason: "Already exists in the archive folder." };
	await ensureFolder(app, destination.split("/").slice(0, -1).join("/"));
	// Why: renameFile also updates links to the file, which an empty note may still have.
	await app.fileManager.renameFile(target!, destination);
	return { path, outcome: "archived" };
}

async function whyNoLongerListed(
	app: App,
	kind: AuditKind,
	target: TAbstractFile,
): Promise<string | undefined> {
	switch (kind) {
		case "orphaned-files":
			if (!(target instanceof TFile)) return "Not a file.";
			return isLinkedFromOtherFile(app, target.path) ? "Now linked from a note." : undefined;
		case "empty-files":
			if (!(target instanceof TFile)) return "Not a file.";
			return (await isEmptyFile(app, target)) ? undefined : "No longer empty.";
		case "empty-folders":
			if (!(target instanceof TFolder)) return "Not a folder.";
			return holdsFiles(target) ? "No longer empty." : undefined;
		case "broken-links":
			return "Broken links cannot be moved.";
	}
}

function isLinkedFromOtherFile(app: App, path: string): boolean {
	return Object.entries(app.metadataCache.resolvedLinks).some(
		([source, targets]) => source !== path && path in targets,
	);
}

async function isEmptyFile(app: App, file: TFile): Promise<boolean> {
	if (file.extension !== "md") return file.stat.size === 0;
	// Why: read the file itself; the metadata cache may not have caught up with an edit yet.
	const content = await app.vault.cachedRead(file);
	return content.slice(getFrontMatterInfo(content).contentStart).trim() === "";
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
	const failed = count("failed");
	if (failed > 0) parts.push(`${failed} failed; see the console.`);
	return parts.join(" ");
}

export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
