import type { App, HeadingCache, TFile } from "obsidian";
import { t } from "src/i18n";
import type { HeadingResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { ICONS } from "src/ui/icons";

/** 元のノートの見出しを文書の順に並べ、クエリがあれば見出しの文字列で絞り込む。 */
export class HeadingProvider implements PaletteProvider<HeadingResult> {
	constructor(private readonly app: App) {}

	async search({ mode, query, sourceFile }: PaletteSearchRequest): Promise<HeadingResult[]> {
		if (mode !== "heading") throw new Error(`HeadingProvider cannot search mode: ${mode}`);
		const file = sourceFile ?? this.app.workspace.getActiveFile();
		if (!file) return [];
		const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
		const results = headings.map((heading) => toHeadingResult(file, heading));
		// 空のクエリでは一致の基準がなく、元の順序のまま並ぶ。
		return searchFuzzyQuery(query, results, [(result) => result.primary]).map(({ obj }) => obj);
	}
}

function toHeadingResult(file: TFile, heading: HeadingCache): HeadingResult {
	const line = heading.position.start.line;
	return {
		id: `heading:${file.path}:${line}`,
		mode: "heading",
		primary: heading.heading,
		secondary: t("palette.heading.line", { line: line + 1 }),
		icon: ICONS.heading,
		file,
		line,
		level: heading.level,
	};
}
