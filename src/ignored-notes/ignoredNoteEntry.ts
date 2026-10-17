import {
	getFrontMatterInfo,
	parseFrontMatterAliases,
	parseFrontMatterTags,
	parseYaml,
} from "obsidian";
import { normalizeTags } from "src/search/file/fileTags";
import { normalizeFrontmatterKeywords, normalizeFrontmatterPrior } from "src/shared/frontmatter";
import { logger } from "src/shared/logger";

export interface IgnoredNoteIndexEntry {
	path: string;
	basename: string;
	extension: string;
	aliases: string[];
	keywords: string[];
	tags: string[];
	prior?: number;
	mtime: number;
	size: number;
}

export function parseIgnoredNoteFrontmatter(
	content: string,
): Pick<IgnoredNoteIndexEntry, "aliases" | "keywords" | "tags" | "prior"> {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return { aliases: [], keywords: [], tags: [] };
	try {
		// 一度だけ解析し、検索できるメタデータがすべて同じスナップショットから来るようにする。
		const parsed = parseYaml(info.frontmatter);
		const frontmatter =
			parsed && typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: null;
		return {
			aliases: parseFrontMatterAliases(frontmatter) ?? [],
			keywords: normalizeFrontmatterKeywords(frontmatter?.keywords),
			tags: normalizeTags(parseFrontMatterTags(frontmatter) ?? []),
			prior: normalizeFrontmatterPrior(frontmatter?.prior),
		};
	} catch (error) {
		// 壊れたフロントマターでもノートは一覧に出す。メタデータだけは使わない。
		logger.debug("Failed to read frontmatter of an Obsidian-excluded note", error);
		return { aliases: [], keywords: [], tags: [] };
	}
}
