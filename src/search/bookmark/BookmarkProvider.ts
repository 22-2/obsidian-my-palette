import { TFile, type App } from "obsidian";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	filterExcludedFolders,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import type { BookmarkResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import {
	BOOKMARK_PATH_SEPARATOR,
	getBookmarksInstance,
	type BookmarkEntry,
} from "src/search/bookmark/bookmarks";

/** Reads the core Bookmarks plugin's nested items and exposes usable entries for the palette. */
export class BookmarkProvider implements PaletteProvider<BookmarkResult> {
	constructor(
		private readonly app: App,
		private readonly excludedFolders: ExcludedFolderSource = EMPTY_EXCLUDED_FOLDER_SOURCE,
	) {}

	async search({ query }: PaletteSearchRequest): Promise<BookmarkResult[]> {
		const results = this.flatten(getBookmarksInstance(this.app)?.items ?? []);
		// search種別には紐づくファイルがないため、file種別のみ共通除外を適用する。
		const visible = filterExcludedFolders(this.excludedFolders, results, (result) =>
			result.kind === "file" ? result.file?.path : undefined,
		);
		if (!query.trim()) return visible;
		return searchFuzzyQuery(query, visible, [
			(result) => result.primary,
			(result) => result.secondary,
		]).map(({ obj }) => obj);
	}

	private flatten(items: BookmarkEntry[], groupPath = ""): BookmarkResult[] {
		return items.flatMap((item) => {
			const label = item.title || item.path || item.query || "Untitled";
			const display = groupPath ? `${groupPath}${BOOKMARK_PATH_SEPARATOR}${label}` : label;
			if (item.type === "group") return this.flatten(item.items ?? [], display);
			if (item.type === "file" && item.path) {
				const file = this.app.vault.getAbstractFileByPath(item.path);
				if (!(file instanceof TFile)) return [];
				return [
					{
						id: `bookmark:file:${item.path}:${display}`,
						mode: "bookmark",
						primary: display,
						secondary: item.path,
						icon: "bookmark",
						kind: "file",
						file,
						entry: item,
					},
				];
			}
			if (item.type === "search" && item.query) {
				return [
					{
						id: `bookmark:search:${item.query}:${display}`,
						mode: "bookmark",
						primary: display,
						secondary: item.query,
						icon: "search",
						kind: "search",
						query: item.query,
						entry: item,
					},
				];
			}
			return [];
		});
	}
}
