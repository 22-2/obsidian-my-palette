import { TFile, type App, type LinkCache } from "obsidian";
import fuzzysort from "fuzzysort";
import type { RelatedFileResult } from "../model/results";
import type { PaletteProvider, PaletteSearchRequest } from "./PaletteProvider";

/** Finds individual outgoing-link or incoming-link occurrences for the active note. */
export class RelatedFileProvider implements PaletteProvider<RelatedFileResult> {
	constructor(private readonly app: App) {}

	async search({ mode, query }: PaletteSearchRequest): Promise<RelatedFileResult[]> {
		if (mode !== "link" && mode !== "backlink")
			throw new Error(`RelatedFileProvider cannot search mode: ${mode}`);
		const origin = this.app.workspace.getActiveFile();
		if (!origin) return [];
		const occurrences = mode === "link" ? this.outgoing(origin) : this.incoming(origin);
		const results = await Promise.all(
			occurrences.map(async ({ file, cache }) => {
				const content = await this.app.vault.cachedRead(file);
				const line = cache.position.start.line;
				const text = content.split(/\r?\n/)[line]?.trim() ?? "";
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
		return fuzzysort
			.go(query, results, {
				keys: [(result) => result.primary, (result) => result.secondary],
			})
			.map(({ obj }) => obj);
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
