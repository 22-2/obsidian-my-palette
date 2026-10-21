import type { App } from "obsidian";
import type { TagResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { tagKey } from "src/tags/tagChoices";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/**
 * Vault のタグを、使われている回数の多い順に一覧にする。`#` の有無と大文字・小文字の違いは
 * 同じタグとして数える。入力したときは、タグ名だけを検索する。
 */
export class TagProvider implements PaletteProvider<TagResult> {
	constructor(private readonly app: App) {}

	async search({ query }: PaletteSearchRequest): Promise<TagResult[]> {
		const merged = new Map<string, { name: string; count: number }>();
		for (const [tag, count] of Object.entries(this.app.metadataCache.getTags())) {
			const key = tagKey(tag);
			const entry = merged.get(key);
			if (entry) entry.count += count;
			else merged.set(key, { name: tag.replace(/^#/, ""), count });
		}

		const rows = [...merged.values()]
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
			.map(({ name, count }): TagResult => ({
				id: `tag:${tagKey(name)}`,
				mode: "tag",
				primary: `#${name}`,
				secondary: t("tag.result.count", { count }),
				icon: ICONS.tagMode,
				tagName: name,
				count,
			}));

		if (query.trim()) {
			return searchFuzzyQuery(query, rows, [(row) => row.primary]).map(({ obj }) => obj);
		}
		return rows;
	}
}
