import type { App } from "obsidian";
import { getVaultFullPath } from "src/ignored-notes/ignoredPaths";
import type { PluginResult } from "src/palette/results";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";
import { hasPluginSettingsTab } from "src/search/plugin/pluginSettings";
import { ICONS } from "src/ui/icons";
import { getCommunityPlugin, getCommunityPluginManifests } from "src/platform/obsidianInternals";

function isEnabled(app: App, pluginId: string): boolean {
	return getCommunityPlugin(app, pluginId) !== undefined;
}

/**
 * Lists installed community plugins so their folders can be opened externally.
 * Disabled plugins stay listed with a mark, since their folders still exist.
 */
export class PluginProvider implements PaletteProvider<PluginResult> {
	constructor(private readonly app: App) {}

	async search({ query }: PaletteSearchRequest): Promise<PluginResult[]> {
		const results: PluginResult[] = [];
		for (const manifest of getCommunityPluginManifests(this.app)) {
			if (!manifest?.id || !manifest.dir) continue;
			const absolutePath = getVaultFullPath(this.app, manifest.dir);
			if (!absolutePath) continue;
			const enabled = isEnabled(this.app, manifest.id);
			results.push({
				id: `plugin:${manifest.id}`,
				mode: "plugin",
				primary: manifest.name || manifest.id,
				secondary:
					`${manifest.id} ${manifest.version ?? ""}${enabled ? "" : " (disabled)"}`.trim(),
				icon: ICONS.plugin,
				pluginId: manifest.id,
				absolutePath,
				vaultPath: manifest.dir,
				enabled,
				hasSettings: hasPluginSettingsTab(this.app, manifest.id),
			});
		}
		const ordered = results.sort((a, b) => a.primary.localeCompare(b.primary));
		if (!query.trim()) return ordered;
		return searchFuzzyQuery(query, ordered, [
			(result) => result.primary,
			(result) => result.pluginId,
		]).map(({ obj }) => obj);
	}
}
