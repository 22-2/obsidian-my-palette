import {
	getFrontMatterInfo,
	parseFrontMatterAliases,
	parseFrontMatterTags,
	parseYaml,
} from "obsidian";
import { normalizeTags } from "src/search/file/fileTags";
import { normalizeFrontmatterKeywords, normalizeFrontmatterPrior } from "src/shared/frontmatter";

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
		// Parse once so all searchable metadata comes from the same snapshot.
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
	} catch {
		return { aliases: [], keywords: [], tags: [] };
	}
}
