import { getFrontMatterInfo, type App, type TFile } from "obsidian";
import { isMocOnly } from "src/moc-relateds/mocRelatedsCore";
import { t } from "src/i18n";

export type NoteEmptiness = { kind: "empty" } | { kind: "moc-only" } | { kind: "written" };

/**
 * ファイルに中身があるかどうかを、ファイル自体から読んで判定する。メタデータキャッシュが
 * まだ編集に追いついていないことがあるため。Vault 監査の操作と、MOC 削除セレクターで共有する。
 */
export async function noteEmptiness(app: App, file: TFile): Promise<NoteEmptiness> {
	if (file.extension !== "md")
		return file.stat.size === 0 ? { kind: "empty" } : { kind: "written" };
	const content = await app.vault.cachedRead(file);
	if (content.slice(getFrontMatterInfo(content).contentStart).trim() === "")
		return { kind: "empty" };
	return isMocOnly(content) ? { kind: "moc-only" } : { kind: "written" };
}

/** 空のノート、または MOC だけを持つノートの横に一覧が出す短い印。 */
export const EMPTINESS_LABELS = {
	empty: t("audit.emptiness.empty"),
	"moc-only": t("audit.emptiness.mocOnly"),
} as const satisfies Record<Exclude<NoteEmptiness["kind"], "written">, string>;

export function emptinessBadge(emptiness: NoteEmptiness): string | undefined {
	return emptiness.kind === "written" ? undefined : EMPTINESS_LABELS[emptiness.kind];
}

/** Vault 監査の「空のファイル」の行に付く印。MOC 削除セレクターと同じもの。 */
export function emptyFileLabel(mocOnly: true | undefined): string {
	return EMPTINESS_LABELS[mocOnly ? "moc-only" : "empty"];
}
