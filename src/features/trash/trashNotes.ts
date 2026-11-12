import { TFile, type App } from "obsidian";
import { t } from "src/i18n";

export interface TrashNoteResult {
	path: string;
	result: "trashed" | "failed";
	reason?: string;
}

function isMarkdown(file: TFile): boolean {
	return file.extension.toLocaleLowerCase() === "md";
}

/** 各ファイルを確認してゴミ箱へ移し、失敗しても残りを処理する。`accept` を満たさないファイルは失敗にする。 */
async function trashEach(
	app: App,
	paths: readonly string[],
	accept: (file: TFile) => boolean,
	missingMessage: string,
	expectedContents?: ReadonlyMap<string, string>,
): Promise<TrashNoteResult[]> {
	const results: TrashNoteResult[] = [];
	for (const path of paths) {
		try {
			const current = app.vault.getAbstractFileByPath(path);
			if (!(current instanceof TFile) || !accept(current)) throw new Error(missingMessage);
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

/** Markdown ノートだけを対象に、各ノートを確認してゴミ箱へ移す。 */
export function trashNotes(
	app: App,
	paths: readonly string[],
	expectedContents?: ReadonlyMap<string, string>,
): Promise<TrashNoteResult[]> {
	return trashEach(app, paths, isMarkdown, t("noteDelete.error.missing"), expectedContents);
}

/** 拡張子を問わず、Vault のファイル(`.base`、`.canvas`、添付など)をゴミ箱へ移す。 */
export function trashFiles(app: App, paths: readonly string[]): Promise<TrashNoteResult[]> {
	return trashEach(app, paths, () => true, t("fileDelete.error.missing"));
}
