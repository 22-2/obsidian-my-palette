import type { App } from "obsidian";
import { getVaultFullPath } from "src/ignored-notes/ignoredPaths";
import type { SnippetResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { ICONS } from "src/ui/icons";

interface CustomCss {
	snippets?: unknown;
	enabledSnippets?: unknown;
	getSnippetsFolder?: () => string;
	getSnippetPath?: (snippet: string) => string;
}

function getCustomCss(app: App): CustomCss {
	return (app as unknown as { customCss?: CustomCss }).customCss ?? {};
}

function listSnippets(app: App): string[] {
	const snippets = getCustomCss(app).snippets;
	return Array.isArray(snippets)
		? snippets.filter((name): name is string => typeof name === "string" && name.length > 0)
		: [];
}

function isEnabled(app: App, snippet: string): boolean {
	const enabled = getCustomCss(app).enabledSnippets;
	if (enabled instanceof Set) return enabled.has(snippet);
	if (Array.isArray(enabled)) return enabled.includes(snippet);
	if (enabled && typeof enabled === "object")
		return Boolean((enabled as Record<string, unknown>)[snippet]);
	return false;
}

function displayName(snippet: string): string {
	return snippet.replace(/\.css$/i, "");
}

/**
 * Lists the snippets folder first, then each CSS snippet, so the folder can be
 * opened externally like a plugin folder. Typed input searches snippets only.
 */
export class SnippetProvider implements PaletteProvider<SnippetResult> {
	constructor(private readonly app: App) {}

	async search({ query }: PaletteSearchRequest): Promise<SnippetResult[]> {
		const customCss = getCustomCss(this.app);
		const folderVaultPath = customCss.getSnippetsFolder?.();
		const folderAbsolutePath =
			typeof folderVaultPath === "string"
				? (getVaultFullPath(this.app, folderVaultPath) ?? undefined)
				: undefined;

		const snippets = listSnippets(this.app)
			.flatMap((snippet): SnippetResult[] => {
				const vaultPath = customCss.getSnippetPath?.(snippet);
				if (typeof vaultPath !== "string") return [];
				const absolutePath = getVaultFullPath(this.app, vaultPath);
				if (!absolutePath) return [];
				const enabled = isEnabled(this.app, snippet);
				return [
					{
						id: `snippet:${snippet}`,
						mode: "snippet",
						primary: displayName(snippet),
						secondary: enabled ? "Enabled" : "Disabled",
						icon: ICONS.snippet,
						snippetName: snippet,
						absolutePath,
						vaultPath,
						isFolder: false,
						enabled,
					},
				];
			})
			.sort((a, b) => a.primary.localeCompare(b.primary));

		if (query.trim()) {
			return searchFuzzyQuery(query, snippets, [(result) => result.primary]).map(
				({ obj }) => obj,
			);
		}
		if (!folderAbsolutePath || typeof folderVaultPath !== "string") return snippets;
		return [
			{
				id: "snippet:folder",
				mode: "snippet",
				primary: "snippets folder",
				secondary: folderVaultPath,
				icon: ICONS.folder,
				snippetName: "",
				absolutePath: folderAbsolutePath,
				vaultPath: folderVaultPath,
				isFolder: true,
				enabled: true,
			},
			...snippets,
		];
	}
}
