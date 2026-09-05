import type MyPalettePlugin from "src/main";
import type { SearchHistoryEntry } from "src/model/settings";
import { mergeSettings } from "src/settings/mergeSettings";
import {
	parseStoredSearchHistoryEntries,
	pruneStoredSearchHistory,
} from "src/palette/searchHistory";

export interface LoadedPluginSettings {
	legacySearchHistoryEntries: SearchHistoryEntry[];
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
	const storedSchemaVersion =
		data && typeof data === "object" && "schemaVersion" in data
			? (data as { schemaVersion?: unknown }).schemaVersion
			: undefined;
	return {
		legacySearchHistoryEntries,
		// An old schema or legacy entries need to be written after the history
		// store has accepted the migration, so data.json never loses its fallback.
		shouldSave:
			Object.prototype.hasOwnProperty.call(rawSearchHistory, "entries") ||
			(typeof storedSchemaVersion === "number" &&
				storedSchemaVersion < plugin.settings.schemaVersion),
	};
}

export async function savePluginSettings(
	plugin: MyPalettePlugin,
	legacySearchHistoryEntries?: readonly SearchHistoryEntry[],
): Promise<void> {
	const data =
		legacySearchHistoryEntries === undefined
			? plugin.settings
			: {
					...plugin.settings,
					searchHistory: {
						...plugin.settings.searchHistory,
						entries: legacySearchHistoryEntries,
					},
				};
	await plugin.saveData(data);
}
