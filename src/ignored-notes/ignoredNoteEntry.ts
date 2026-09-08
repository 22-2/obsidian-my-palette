import {
	getFrontMatterInfo,
	parseFrontMatterAliases,
	parseFrontMatterTags,
	parseYaml,
} from "obsidian";
import { normalizeTags } from "src/search/file/fileTags";
import { normalizeFrontmatterPrior } from "src/shared/frontmatter";

export interface IgnoredNoteIndexEntry {
	path: string;
	basename: string;
	extension: string;
	aliases: string[];
	tags: string[];
	prior?: number;
	mtime: number;
	size: number;
}

export function parseIgnoredNoteFrontmatter(
	content: string,
): Pick<IgnoredNoteIndexEntry, "aliases" | "tags" | "prior"> {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return { aliases: [], tags: [] };
	try {
		// Parse once per scanned note so aliases, tags, and prior come from the
		// same frontmatter snapshot without tripling the YAML parse cost.
		const parsed = parseYaml(info.frontmatter);
		const frontmatter =
			parsed && typeof parsed === "object" && !Array.isArray(parsed)
				? (parsed as Record<string, unknown>)
				: null;
		return {
			aliases: parseFrontMatterAliases(frontmatter) ?? [],
			tags: normalizeTags(parseFrontMatterTags(frontmatter) ?? []),
			prior: normalizeFrontmatterPrior(frontmatter?.prior),
		};
	} catch {
		return { aliases: [], tags: [] };
	}
}
