import type MyPalettePlugin from "src/main";
import type { SearchHistoryEntry } from "src/model/settings";
import { normalizeRecentCommandIds } from "src/search/command/recentCommandStore";
import { mergeSettings } from "src/settings/mergeSettings";
import {
	parseStoredSearchHistoryEntries,
	pruneStoredSearchHistory,
} from "src/palette/searchHistory";

export interface LoadedPluginSettings {
	legacySearchHistoryEntries: SearchHistoryEntry[];
	legacyRecentCommandIds: string[];
	shouldSave: boolean;
}

/**
 * Persistence policy is isolated from the settings UI so schema migrations do
 * not depend on rendering controls or the Obsidian settings pane.
 */
export async function loadPluginSettings(plugin: MyPalettePlugin): Promise<LoadedPluginSettings> {
	const data = await plugin.loadData();
	plugin.settings = mergeSettings(data);
	const source = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const rawSearchHistory =
		source.searchHistory && typeof source.searchHistory === "object"
			? (source.searchHistory as Record<string, unknown>)
			: {};
	const legacySearchHistoryEntries = pruneStoredSearchHistory(
		parseStoredSearchHistoryEntries(rawSearchHistory.entries, plugin.settings.prefixes),
		Date.now(),
		plugin.settings.searchHistory.daysToKeep,
	);
	const legacyRecentCommandIds = normalizeRecentCommandIds(source.recentCommandIds);
	const storedSchemaVersion =
		data && typeof data === "object" && "schemaVersion" in data
			? (data as { schemaVersion?: unknown }).schemaVersion
			: undefined;
	return {
		legacySearchHistoryEntries,
		legacyRecentCommandIds,
		// An old schema or legacy history data needs to be written after both
		// stores accept migration, so data.json never loses its fallback.
		shouldSave:
			Object.prototype.hasOwnProperty.call(rawSearchHistory, "entries") ||
			Object.prototype.hasOwnProperty.call(source, "recentCommandIds") ||
			(typeof storedSchemaVersion === "number" &&
				storedSchemaVersion < plugin.settings.schemaVersion),
	};
}

export async function savePluginSettings(
	plugin: MyPalettePlugin,
	legacySearchHistoryEntries?: readonly SearchHistoryEntry[],
	legacyRecentCommandIds?: readonly string[],
): Promise<void> {
	const data: Record<string, unknown> = { ...plugin.settings };
	if (legacySearchHistoryEntries !== undefined)
		data.searchHistory = {
			...plugin.settings.searchHistory,
			entries: legacySearchHistoryEntries,
		};
	if (legacyRecentCommandIds !== undefined) data.recentCommandIds = [...legacyRecentCommandIds];
	await plugin.saveData(data);
}
