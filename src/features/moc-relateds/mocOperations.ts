import type { App, TFile } from "obsidian";
import {
	addLinkToMocRelateds,
	removeLinkFromMocRelateds,
} from "src/features/moc-relateds/mocRelatedsCore";
import { t } from "src/i18n";

export interface MocPlannedLink {
	from: string;
	to: string;
	result: "added" | "already-linked" | "removed" | "missing" | "failed";
	reason?: string;
}

export interface MocPlannedFile {
	file: TFile;
	path: string;
	before: string;
	after: string;
}

export interface MocInsertionPlan {
	files: MocPlannedFile[];
	links: MocPlannedLink[];
}

/** 実際のノートは変更せず、相互リンクの変更予定を作る。 */
export async function planMocInsertion(
	app: App,
	moc: TFile,
	targets: readonly TFile[],
	mutual: boolean,
): Promise<MocInsertionPlan> {
	return planMocLinks(app, moc, targets, mutual, "insert");
}

/** MOC と対象ノートの Relateds から外すリンクを計画する。 */
export async function planMocRemoval(
	app: App,
	moc: TFile,
	targets: readonly TFile[],
	mutual: boolean,
): Promise<MocInsertionPlan> {
	return planMocLinks(app, moc, targets, mutual, "remove");
}

async function planMocLinks(
	app: App,
	moc: TFile,
	targets: readonly TFile[],
	mutual: boolean,
	operation: "insert" | "remove",
): Promise<MocInsertionPlan> {
	const files = await Promise.all(
		[moc, ...targets].map(async (file) => {
			const before = await app.vault.read(file);
			return { file, path: file.path, before, after: before };
		}),
	);
	const links: MocPlannedLink[] = [];
	const tabSize = Number(app.vault.getConfig("tabSize")) || 4;
	const edit = (from: MocPlannedFile, to: TFile): void => {
		const change =
			operation === "insert"
				? addLinkToMocRelateds(from.after, to.basename, tabSize)
				: removeLinkFromMocRelateds(from.after, to.basename);
		if (change.success) {
			from.after = change.newContent;
			links.push({
				from: from.path,
				to: to.path,
				result: operation === "insert" ? "added" : "removed",
			});
		} else if (operation === "insert" && change.message === t("moc.core.alreadyExists")) {
			links.push({ from: from.path, to: to.path, result: "already-linked" });
		} else if (operation === "remove" && change.message === t("moc.core.notFound")) {
			links.push({ from: from.path, to: to.path, result: "missing" });
		} else {
			links.push({ from: from.path, to: to.path, result: "failed", reason: change.message });
		}
	};
	for (let index = 0; index < targets.length; index++) {
		edit(files[0], targets[index]);
		if (mutual) edit(files[index + 1], moc);
	}
	return { files, links };
}

/** 各ノートを更新時に再確認する。先に成功したノートは失敗時も変更されたまま。 */
export async function executeMocInsertion(
	app: App,
	plan: MocInsertionPlan,
): Promise<{ path: string; result: "updated" | "unchanged" | "failed"; reason?: string }[]> {
	const results: { path: string; result: "updated" | "unchanged" | "failed"; reason?: string }[] =
		[];
	for (const item of plan.files) {
		try {
			if (item.file.path !== item.path) throw new Error(t("merge.error.changed"));
			if (item.before === item.after) {
				if ((await app.vault.read(item.file)) !== item.before)
					throw new Error(t("merge.error.changed"));
				results.push({ path: item.path, result: "unchanged" });
				continue;
			}
			await app.vault.process(item.file, (current) => {
				if (current !== item.before) throw new Error(t("merge.error.changed"));
				return item.after;
			});
			results.push({ path: item.path, result: "updated" });
		} catch (error) {
			results.push({
				path: item.path,
				result: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}
