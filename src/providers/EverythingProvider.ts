import { TFile, type App } from "obsidian";
import { getVaultRootPath, isUserIgnoredPath, vaultPathFromAbsolute } from "../core/ignoredPaths";
import type { MyPaletteSettings } from "../model/settings";
import type { EverythingResult } from "../model/results";
import { EverythingHttpClient } from "../everything/EverythingHttpClient";
import type { PaletteProvider, PaletteSearchRequest } from "./PaletteProvider";

export class EverythingProvider implements PaletteProvider<EverythingResult> {
	constructor(
		private readonly app: App,
		private readonly client: EverythingHttpClient,
		private readonly settings: () => MyPaletteSettings["everything"],
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
		const extensionFilter = settings.vaultExtensions.length
			? `ext:${settings.vaultExtensions.join(";")}`
			: "";
		const scopedQuery = [`path:"${vaultRoot}"`, scope === "vault" && extensionFilter, query]
			.filter(Boolean)
			.join(" ");
		const results = await this.client.search(scopedQuery, settings, signal, 500);
		return results
			.flatMap((result): EverythingResult[] => {
				if (result.kind !== "file") return [];
				const vaultPath = vaultPathFromAbsolute(this.app, result.absolutePath);
				if (vaultPath === null) return [];
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
