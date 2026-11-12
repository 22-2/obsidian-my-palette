import { TFile, type App } from "obsidian";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";

/** 移動先が選ばれるまで Vault にコピーされない、Obsidian の除外ノート。 */
export interface ExcludedNoteSource {
	excludedPath: string;
}

export type MoveSource = TFile | ExcludedNoteSource;

export function moveSourcePath(source: MoveSource): string {
	return source instanceof TFile ? source.path : source.excludedPath;
}

export interface MoveFileResult {
	path: string;
	result: "moved" | "unchanged" | "failed";
	reason?: string;
}

/** リンクの更新を待ってから次へ進み、失敗したファイルがあっても残りを移動する。 */
export async function moveFiles(
	app: App,
	sources: readonly MoveSource[],
	folder: string,
): Promise<MoveFileResult[]> {
	const results: MoveFileResult[] = [];
	for (const source of sources) {
		const path = moveSourcePath(source);
		try {
			const file =
				source instanceof TFile
					? source
					: await materializeIgnoredNote(app, source.excludedPath);
			const destination = folder ? `${folder}/${file.name}` : file.name;
			if (destination === file.path) {
				results.push({ path, result: "unchanged" });
				continue;
			}
			await app.fileManager.renameFile(file, destination);
			results.push({ path, result: "moved" });
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
