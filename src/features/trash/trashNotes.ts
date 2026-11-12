import { TFile, type App } from "obsidian";
import { t } from "src/i18n";

export interface TrashNoteResult {
	path: string;
	result: "trashed" | "failed";
	reason?: string;
}

/** 各ノートを確認してゴミ箱へ移し、失敗しても残りを処理する。 */
export async function trashNotes(
	app: App,
	paths: readonly string[],
	expectedContents?: ReadonlyMap<string, string>,
): Promise<TrashNoteResult[]> {
	const results: TrashNoteResult[] = [];
	for (const path of paths) {
		try {
			const current = app.vault.getAbstractFileByPath(path);
			if (!(current instanceof TFile) || current.extension.toLocaleLowerCase() !== "md")
				throw new Error(t("noteDelete.error.missing"));
			if (expectedContents && (await app.vault.read(current)) !== expectedContents.get(path))
				throw new Error(t("merge.error.changed"));
			await app.fileManager.trashFile(current);
			results.push({ path, result: "trashed" });
		} catch (error) {
			results.push({
				path,
				result: "failed",
				reason: error instanceof Error ? error.message : String(error),
			});
		}
	}
	return results;
}
