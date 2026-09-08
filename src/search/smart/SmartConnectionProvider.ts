import { TFile, type App } from "obsidian";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	isExcludedFolder,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import type { SmartConnectionResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

interface SmartSource {
	vec?: number[];
}

interface NearestResult {
	item: { key: string };
	score: number;
}

interface SmartConnectionsEnvironment {
	smart_sources: {
		get: (path: string) => SmartSource | undefined;
		entities_vector_adapter: {
			nearest: (vector: number[], options: { limit: number }) => Promise<NearestResult[]>;
		};
	};
}

/** Queries Smart Connections' existing embeddings for notes related to the active note. */
export class SmartConnectionProvider implements PaletteProvider<SmartConnectionResult> {
	constructor(
		private readonly app: App,
		private readonly excludedFolders: ExcludedFolderSource = EMPTY_EXCLUDED_FOLDER_SOURCE,
	) {}

	async search({ query, sourceFile }: PaletteSearchRequest): Promise<SmartConnectionResult[]> {
		const origin = sourceFile ?? this.app.workspace.getActiveFile();
		if (!origin) throw new Error("Open a note before searching Smart Connections.");
		const environment = this.environment();
		if (!environment) throw new Error("Smart Connections is not enabled.");
		const source = environment.smart_sources.get(origin.path);
		if (!source?.vec)
			throw new Error("The active note has no Smart Connections embedding yet.");

		const nearest = await environment.smart_sources.entities_vector_adapter.nearest(
			source.vec,
			{
				limit: 16,
			},
		);
		const results = nearest.flatMap(({ item, score }) => {
			const file = this.app.vault.getAbstractFileByPath(item.key);
			if (!(file instanceof TFile) || file.path === origin.path) return [];
			if (isExcludedFolder(this.excludedFolders, file.path)) return [];
			return [
				{
					id: `smart:${file.path}`,
					mode: "smart" as const,
					primary: file.basename,
					secondary: file.path,
					icon: "brain-circuit",
					file,
					score,
				},
			];
		});
		if (!query.trim()) return results;
		return searchFuzzyQuery(query, results, [
			(result) => result.primary,
			(result) => result.secondary,
		]).map(({ obj }) => obj);
	}

	private environment(): SmartConnectionsEnvironment | undefined {
		const plugins = (
			this.app as unknown as {
				plugins?: { plugins?: Record<string, { env?: SmartConnectionsEnvironment }> };
			}
		).plugins?.plugins;
		return plugins?.["smart-connect-pro"]?.env ?? plugins?.["smart-connections"]?.env;
	}
}
