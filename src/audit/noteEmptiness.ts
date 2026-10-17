import { getFrontMatterInfo, type App, type TFile } from "obsidian";
import { isMocOnly } from "src/moc-relateds/mocRelatedsCore";

export type NoteEmptiness = { kind: "empty" } | { kind: "moc-only" } | { kind: "written" };

/**
 * Whether a file says anything, read from the file itself: the metadata cache may not have
 * caught up with an edit yet. Shared by Vault audit's actions and the MOC remove selector.
 */
export async function noteEmptiness(app: App, file: TFile): Promise<NoteEmptiness> {
	if (file.extension !== "md")
		return file.stat.size === 0 ? { kind: "empty" } : { kind: "written" };
	const content = await app.vault.cachedRead(file);
	if (content.slice(getFrontMatterInfo(content).contentStart).trim() === "")
		return { kind: "empty" };
	return isMocOnly(content) ? { kind: "moc-only" } : { kind: "written" };
}

/** The short mark a list shows beside a note that is empty or holds only its MOC. */
export const EMPTINESS_LABELS = {
	empty: "Empty",
	"moc-only": "MOC only",
} as const satisfies Record<Exclude<NoteEmptiness["kind"], "written">, string>;

export function emptinessBadge(emptiness: NoteEmptiness): string | undefined {
	return emptiness.kind === "written" ? undefined : EMPTINESS_LABELS[emptiness.kind];
}

/** The mark of a row in Vault audit's Empty files, the same as the MOC remove selector's. */
export function emptyFileLabel(mocOnly: true | undefined): string {
	return EMPTINESS_LABELS[mocOnly ? "moc-only" : "empty"];
}
