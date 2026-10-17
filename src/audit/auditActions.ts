import { TFile, TFolder, type App, type TAbstractFile } from "obsidian";
import { noteEmptiness } from "src/audit/noteEmptiness";
import { logger } from "src/shared/logger";
import type { AuditKind } from "src/audit/vaultAudit";
import { removeLinkFromMocRelateds } from "src/moc-relateds/mocRelatedsCore";
import { t } from "src/i18n";

export interface AuditActionResult {
	path: string;
	outcome: "trashed" | "skipped" | "failed";
	reason?: string;
	/** ゴミ箱に移動したMOC専用ノートへのリンクを、Relateds から外したノート。 */
	unlinkedFrom?: string[];
}

/** 項目がファイルまたはフォルダーで移動できる種類。壊れたリンクは移動できない。 */
export function canTrash(kind: AuditKind): boolean {
	return kind !== "broken-links";
}

/** 項目がファイルの種類。パレットの「移動」で別の場所へ移せる。 */
export function listsFiles(kind: AuditKind): boolean {
	return kind === "orphaned-files" || kind === "empty-files";
}

/**
 * 項目を1つずつゴミ箱に移動する。一覧を作ったあとに Vault が変わっているかもしれないため、
 * 各項目を移動の前にもう一度確認する。
 */
export async function trashAuditItems(
	app: App,
	kind: AuditKind,
	paths: readonly string[],
): Promise<AuditActionResult[]> {
	if (!canTrash(kind)) throw new Error(t("audit.error.notTrashable", { kind }));
	// Why: 項目ごとにすべてのリンクを調べず、一括の処理で一度だけ作る。ファイルをゴミ箱に
	// 移すとリンクが減るだけなので、古い集合では項目を飛ばすことはあっても、
	// リンクされたものをゴミ箱に入れることはない。
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
	if (!target) return { path, outcome: "skipped", reason: t("audit.reason.missing") };
	const state = await currentState(app, kind, target, linked);
	if (typeof state === "string") return { path, outcome: "skipped", reason: state };
	// Why: MOC専用ノートは、相手のノートの Relateds からリンクされている。これだけを
	// ゴミ箱に入れると、それらのリンクが壊れたままになるため。
	const unlinkedFrom =
		state.mocOnly && target instanceof TFile ? await unlinkFromRelateds(app, target) : [];
	await app.fileManager.trashFile(target);
	return { path, outcome: "trashed", ...(unlinkedFrom.length > 0 ? { unlinkedFrom } : {}) };
}

/** 項目がまだ一覧に入るべきか。文字列を返した場合は、入らなくなった理由を表す。 */
async function currentState(
	app: App,
	kind: AuditKind,
	target: TAbstractFile,
	linked: ReadonlySet<string>,
): Promise<{ mocOnly: boolean } | string> {
	const listed = { mocOnly: false };
	switch (kind) {
		case "orphaned-files":
			if (!(target instanceof TFile)) return t("audit.reason.notFile");
			return linked.has(target.path) ? t("audit.reason.linked") : listed;
		case "empty-files": {
			if (!(target instanceof TFile)) return t("audit.reason.notFile");
			const { kind: emptiness } = await noteEmptiness(app, target);
			if (emptiness === "empty") return listed;
			return emptiness === "moc-only" ? { mocOnly: true } : t("audit.reason.notEmpty");
		}
		case "empty-folders":
			if (!(target instanceof TFolder)) return t("audit.reason.notFolder");
			return holdsFiles(target) ? t("audit.reason.notEmpty") : listed;
		case "broken-links":
			return t("audit.reason.brokenLinks");
	}
}

/** そのノートにリンクしているすべてのノートの MOC Relateds から、ノートへのリンクを外す。外したノートを返す。 */
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
			// Why: Relateds の外にあるリンクや、入れ子の項目を持つリンクは、ユーザーに任せて残す。
			return result.success ? result.newContent : content;
		});
		if (removed) unlinked.push(source.path);
	}
	return unlinked;
}

/** ほかのファイルからリンクされているすべてのファイル。自分自身へのリンクは数えない。 */
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

/** 一括処理の結果を1つの通知にまとめる。移動した数と、スキップ・失敗した数を出す。 */
export function describeAuditActionResults(
	kind: AuditKind,
	results: readonly AuditActionResult[],
): string {
	const count = (outcome: AuditActionResult["outcome"]) =>
		results.filter((result) => result.outcome === outcome).length;
	const noun = kind === "empty-folders" ? "フォルダー" : "ファイル";
	const parts = [t("audit.summary.trashed", { noun, count: count("trashed") })];
	const skipped = count("skipped");
	if (skipped > 0) parts.push(t("audit.summary.skipped", { count: skipped }));
	const unlinked = new Set(results.flatMap((result) => result.unlinkedFrom ?? [])).size;
	if (unlinked > 0) parts.push(t("audit.summary.unlinked", { count: unlinked }));
	const failed = count("failed");
	if (failed > 0) parts.push(t("audit.summary.failed", { count: failed }));
	return parts.join(" ");
}
