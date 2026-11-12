import { TFile, type App } from "obsidian";
import { t } from "src/i18n";
import { isBlocked, renamableRows, type RenamePlanRow } from "src/features/rename/renamePlan";

export interface RenameFileResult {
	path: string;
	newPath: string;
	result: "renamed" | "failed";
	reason?: string;
}

/** 確認済みの行を順に実行し、1件の失敗で残りを止めない。 */
export async function renameFiles(
	app: App,
	rows: readonly RenamePlanRow[],
): Promise<RenameFileResult[]> {
	if (isBlocked(rows)) throw new Error(t("rename.notice.fixMarked"));
	const results: RenameFileResult[] = [];
	for (const row of renamableRows(rows)) {
		try {
			const file = app.vault.getAbstractFileByPath(row.path);
			if (!(file instanceof TFile)) throw new Error(t("rename.error.notFound"));
			await app.fileManager.renameFile(file, row.newPath);
			results.push({ path: row.path, newPath: row.newPath, result: "renamed" });
		} catch (error) {
			results.push({
				path: row.path,
				newPath: row.newPath,
				result: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}
