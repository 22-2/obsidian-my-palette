import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import { noteEmptiness } from "src/audit/noteEmptiness";
import { logger } from "src/shared/logger";
import type { AuditKind } from "src/audit/vaultAudit";
import { removeLinkFromMocRelateds } from "src/moc-relateds/mocRelatedsCore";

export interface AuditActionResult {
	path: string;
	outcome: "trashed" | "skipped" | "failed";
	reason?: string;
	/** Notes whose MOC Relateds no longer link to a trashed MOC-only note. */
	unlinkedFrom?: string[];
}

/** Kinds whose items are files or folders that can be moved; broken links are not. */
export function canTrash(kind: AuditKind): boolean {
	return kind !== "broken-links";
}

/** Kinds whose items are files, which the palette's Move to… can take elsewhere. */
export function listsFiles(kind: AuditKind): boolean {
	return kind === "orphaned-files" || kind === "empty-files";
}

/**
 * Moves the items to the trash, one at a time. Each item is checked again first, because
 * the vault may have changed since the list was made.
 */
export async function trashAuditItems(
	app: App,
	kind: AuditKind,
	paths: readonly string[],
): Promise<AuditActionResult[]> {
	if (!canTrash(kind)) throw new Error(`${kind} cannot be moved to trash.`);
	// Why: built once for the batch rather than scanning every link per item. Trashing files
	// only takes links away, so a stale set can skip an item but never trashes a linked one.
	const linked = kind === "orphaned-files" ? linkedFromOtherFiles(app) : new Set<string>();
	const results: AuditActionResult[] = [];
	for (const path of paths) {
		try {
			results.push(await trashItem(app, kind, path, linked));
		} catch (error) {
			logger.error(`Vault audit could not trash ${path}`, error);
			results.push({
				path,
				outcome: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}

async function trashItem(
	app: App,
	kind: AuditKind,
	path: string,
	linked: ReadonlySet<string>,
): Promise<AuditActionResult> {
	const target = app.vault.getAbstractFileByPath(path);
	if (!target) return { path, outcome: "skipped", reason: "No longer exists." };
	const state = await currentState(app, kind, target, linked);
	if (typeof state === "string") return { path, outcome: "skipped", reason: state };
	// Why: a MOC-only note is linked back from its partners' Relateds; trashing it alone
	// would leave those links broken.
	const unlinkedFrom =
		state.mocOnly && target instanceof TFile ? await unlinkFromRelateds(app, target) : [];
	await app.fileManager.trashFile(target);
	return { path, outcome: "trashed", ...(unlinkedFrom.length > 0 ? { unlinkedFrom } : {}) };
}

/** Whether the item still belongs in the list; a string says why it no longer does. */
async function currentState(
	app: App,
	kind: AuditKind,
	target: TAbstractFile,
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
			return emptiness === "moc-only" ? { mocOnly: true } : "No longer empty.";
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

/** One notice for the whole batch: what moved, and how many were skipped or failed. */
export function describeAuditActionResults(
	kind: AuditKind,
	results: readonly AuditActionResult[],
): string {
	const count = (outcome: AuditActionResult["outcome"]) =>
		results.filter((result) => result.outcome === outcome).length;
	const noun = kind === "empty-folders" ? "folder" : "file";
	const parts = [`Moved ${plural(count("trashed"), noun)} to trash.`];
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
