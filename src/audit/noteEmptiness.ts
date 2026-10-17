import { getFrontMatterInfo, type App, type TFile } from "obsidian";
import { analyzeMocOnly } from "src/moc-relateds/mocRelatedsCore";

export type NoteEmptiness =
	| { kind: "empty" }
	| { kind: "moc-only"; references: number }
	| { kind: "written" };

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
	const { mocOnly, references } = analyzeMocOnly(content);
	return mocOnly ? { kind: "moc-only", references } : { kind: "written" };
}

/** The short mark a list shows beside a note that is empty or holds only its MOC. */
export function emptinessBadge(emptiness: NoteEmptiness): string | undefined {
	switch (emptiness.kind) {
		case "empty":
			return "Empty";
		case "moc-only":
			return emptiness.references > 0
				? `MOC only · ${emptiness.references} ref${emptiness.references === 1 ? "" : "s"}`
				: "MOC only";
		case "written":
			return undefined;
	}
}
