import { TFile, type App, type LinkCache } from "obsidian";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	filterExcludedFolders,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import type { RelatedFileResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

/** Finds individual outgoing-link or incoming-link occurrences for the active note. */
export class RelatedFileProvider implements PaletteProvider<RelatedFileResult> {
	constructor(
		private readonly app: App,
		private readonly excludedFolders: ExcludedFolderSource = EMPTY_EXCLUDED_FOLDER_SOURCE,
	) {}

	async search({ mode, query, sourceFile }: PaletteSearchRequest): Promise<RelatedFileResult[]> {
		if (mode !== "link" && mode !== "backlink")
			throw new Error(`RelatedFileProvider cannot search mode: ${mode}`);
		const origin = sourceFile ?? this.app.workspace.getActiveFile();
		if (!origin) return [];
		const occurrences = mode === "link" ? this.outgoing(origin) : this.incoming(origin);
		const allowed = filterExcludedFolders(
			this.excludedFolders,
			occurrences,
			({ file }) => file.path,
		);
		// The link's line lives in the note that contains it: the origin for
		// outgoing links, the linking note for backlinks. Read each note once.
		const lines = new Map<string, Promise<string[]>>();
		const linesOf = (file: TFile): Promise<string[]> => {
			let pending = lines.get(file.path);
			if (!pending) {
				pending = this.app.vault.cachedRead(file).then((content) => content.split(/\r?\n/));
				lines.set(file.path, pending);
			}
			return pending;
		};
		const results = await Promise.all(
			allowed.map(async ({ file, cache }) => {
				const line = cache.position.start.line;
				const text = (await linesOf(mode === "link" ? origin : file))[line]?.trim() ?? "";
				return {
					id: `${mode}:${file.path}:${line}:${cache.position.start.offset}`,
					mode,
					primary: file.basename,
					secondary: `${file.path} · ${line + 1}: ${text}`,
					icon: "file-text",
					file,
					line,
				} satisfies RelatedFileResult;
			}),
		);
		if (!query.trim())
			return results.sort(
				(a, b) => a.file.path.localeCompare(b.file.path) || a.line - b.line,
			);
		return searchFuzzyQuery(query, results, [
			(result) => result.primary,
			(result) => result.secondary,
		]).map(({ obj }) => obj);
	}

	private outgoing(origin: TFile): Array<{ file: TFile; cache: LinkCache }> {
		const links = this.app.metadataCache.getFileCache(origin)?.links ?? [];
		return links.flatMap((cache) => {
			if (!cache.position) return [];
			const file = this.app.metadataCache.getFirstLinkpathDest(cache.link, origin.path);
			return file instanceof TFile ? [{ file, cache }] : [];
		});
	}

	private incoming(origin: TFile): Array<{ file: TFile; cache: LinkCache }> {
		const backlinks = this.app.metadataCache.getBacklinksForFile(origin)?.data;
		if (!backlinks) return [];
		return [...backlinks.entries()].flatMap(([path, caches]) => {
			const file = this.app.vault.getAbstractFileByPath(path);
			return file instanceof TFile
				? caches
						.map((cache) => cache as unknown as LinkCache)
						.filter((cache) => Boolean(cache.position))
						.map((cache) => ({ file, cache }))
				: [];
		});
	}
}
