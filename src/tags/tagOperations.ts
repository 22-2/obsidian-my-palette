import { parseFrontMatterTags, type App, type TFile } from "obsidian";
import {
	mergeFrontmatterTags,
	removeFrontmatterTags,
	setOrDeleteFrontmatterList,
	updateFrontmatter,
} from "src/shared/frontmatter";
import { tagKey } from "src/tags/tagChoices";
import type { MultiSelectChanges } from "src/ui/multiSelectChanges";
import { t } from "src/i18n";

export function frontmatterTags(app: App, file: TFile): string[] {
	return parseFrontMatterTags(app.metadataCache.getFileCache(file)?.frontmatter) ?? [];
}

export interface TagWriteResult {
	path: string;
	result: "updated" | "unchanged" | "failed";
	reason?: string;
}

/** 選択画面の変更を各ノートへ適用し、対象ごとの結果を返す。 */
export async function applyTagChangesToFiles(
	app: App,
	files: readonly TFile[],
	changes: MultiSelectChanges<string>,
	expectedContents?: ReadonlyMap<string, string>,
): Promise<TagWriteResult[]> {
	const results: TagWriteResult[] = [];
	for (const file of files) {
		if (expectedContents) {
			try {
				if ((await app.vault.read(file)) !== expectedContents.get(file.path))
					throw new Error(t("merge.error.changed"));
			} catch (error) {
				results.push({
					path: file.path,
					result: "failed",
					reason: error instanceof Error ? error.message : String(error),
				});
				continue;
			}
		}
		const existing = frontmatterTags(app, file);
		const removals = changes.remove.filter((tag) =>
			existing.some((value) => tagKey(value) === tagKey(tag)),
		);
		if (changes.add.length === 0 && removals.length === 0) {
			results.push({ path: file.path, result: "unchanged" });
			continue;
		}
		const saved = await updateFrontmatter(app, file, "update tags of", (frontmatter) => {
			let tags = frontmatter.tags;
			if (changes.add.length > 0) tags = mergeFrontmatterTags(tags, changes.add);
			if (removals.length > 0) tags = removeFrontmatterTags(tags, removals);
			setOrDeleteFrontmatterList(frontmatter, "tags", Array.isArray(tags) ? tags : []);
		});
		results.push({ path: file.path, result: saved ? "updated" : "failed" });
	}
	return results;
}
