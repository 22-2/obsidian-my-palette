import { TFile, type App } from "obsidian";
import {
	getVaultRootPath,
	isUserIgnoredPath,
	vaultPathFromAbsolute,
} from "src/ignored-notes/ignoredPaths";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	isExcludedFolder,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import type { MyPaletteSettings } from "src/model/settings";
import type { EverythingResult } from "src/model/results";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { buildEverythingQuery } from "src/search/everything/everythingQuery";

export class EverythingProvider implements PaletteProvider<EverythingResult> {
	constructor(
		private readonly app: App,
		private readonly client: EverythingHttpClient,
		private readonly settings: () => MyPaletteSettings["everything"],
		private readonly excludedFolders: ExcludedFolderSource = EMPTY_EXCLUDED_FOLDER_SOURCE,
	) {}
	async search({
		query,
		signal,
		everythingScope: scope = "vault",
	}: PaletteSearchRequest): Promise<EverythingResult[]> {
		const vaultRoot = getVaultRootPath(this.app);
		if (!vaultRoot) throw new Error("This vault adapter cannot resolve the Vault folder.");
		const settings = this.settings();
		const vaultExtensions = new Set(
			settings.vaultExtensions.map((extension) => extension.toLocaleLowerCase()),
		);
		// Directory searches are meant to locate any file beside the current note;
		// Vault-only extension preferences must not hide useful non-Markdown files.
		const extensions = scope === "directory" ? [] : settings.vaultExtensions;
		const scopedQuery = buildEverythingQuery(vaultRoot, scope, extensions, query);
		const results = await this.client.search(scopedQuery, settings, signal, 500);
		return results
			.flatMap((result): EverythingResult[] => {
				if (result.kind !== "file") return [];
				const vaultPath = vaultPathFromAbsolute(this.app, result.absolutePath);
				if (vaultPath === null) return [];
				if (isExcludedFolder(this.excludedFolders, vaultPath)) return [];
				if (scope === "vault") {
					if (isUserIgnoredPath(this.app, vaultPath) || hasHiddenSegment(vaultPath))
						return [];
					const file = this.app.vault.getAbstractFileByPath(vaultPath);
					if (
						!(file instanceof TFile) ||
						(vaultExtensions.size > 0 &&
							!vaultExtensions.has(file.extension.toLocaleLowerCase()))
					)
						return [];
				}
				return [{ ...result, vaultPath, scope }];
			})
			.slice(0, settings.maxResults);
	}
}

function hasHiddenSegment(vaultPath: string): boolean {
	return vaultPath.split("/").some((segment) => segment.startsWith("."));
}
