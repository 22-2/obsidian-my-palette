import { parseFrontMatterAliases, parseFrontMatterTags, type App, type TFile } from "obsidian";
import {
	isTagOrChild,
	renameAliasTags,
	renameFrontmatterTags,
	renameInlineTags,
	type InlineTagPosition,
} from "src/tags/tagRename";

/** 本文・フロントマターの `tags` / `aliases` のいずれかに、`from` 本体か子階層のタグを持つノート。 */
export function findTagRenameTargets(app: App, from: string): TFile[] {
	return app.vault.getMarkdownFiles().filter((file) => {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) return false;
		const inline = (cache.tags ?? []).some((tag) => isTagOrChild(tag.tag.slice(1), from));
		if (inline) return true;
		const frontmatter = cache.frontmatter;
		const tags = parseFrontMatterTags(frontmatter) ?? [];
		const aliases = (parseFrontMatterAliases(frontmatter) ?? []).filter((alias) =>
			alias.startsWith("#"),
		);
		return [...tags, ...aliases].some((tag) => isTagOrChild(tag.replace(/^#/, ""), from));
	});
}

export type TagRenameOutcome = "changed" | "unchanged" | "stale";

/**
 * 1つのノートの本文とフロントマターのタグを `from` から `to` へ書き換える。
 * 本文は読んだ位置が今も一致する場合だけ書き換え、一致しなければ何もせず stale を返す。
 * フロントマターは processFrontMatter に任せる。
 */
export async function applyTagRename(
	app: App,
	file: TFile,
	from: string,
	to: string,
): Promise<TagRenameOutcome> {
	const cache = app.metadataCache.getFileCache(file);
	const positions: InlineTagPosition[] = (cache?.tags ?? [])
		.filter((tag) => isTagOrChild(tag.tag.slice(1), from))
		.map((tag) => ({
			tag: tag.tag,
			start: tag.position.start.offset,
			end: tag.position.end.offset,
		}));

	let stale = false;
	let inlineChanged = false;
	if (positions.length > 0) {
		await app.vault.process(file, (text) => {
			const result = renameInlineTags(text, positions, from, to);
			if (!result) {
				stale = true;
				return text;
			}
			inlineChanged = result.count > 0;
			return result.text;
		});
	}
	if (stale) return "stale";

	let frontmatterChanged = false;
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		for (const key of ["tags", "tag"]) {
			if (!(key in frontmatter)) continue;
			const result = renameFrontmatterTags(frontmatter[key], from, to);
			if (result.changed) {
				frontmatter[key] = result.values;
				frontmatterChanged = true;
			}
		}
		for (const key of ["aliases", "alias"]) {
			if (!Array.isArray(frontmatter[key])) continue;
			const result = renameAliasTags(frontmatter[key], from, to);
			if (result.changed) {
				frontmatter[key] = result.values;
				frontmatterChanged = true;
			}
		}
	});

	return inlineChanged || frontmatterChanged ? "changed" : "unchanged";
}
