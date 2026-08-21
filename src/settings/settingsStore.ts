import type MyPalettePlugin from "src/main";
import { mergeSettings } from "src/settings/mergeSettings";
import { pruneStoredSearchHistory } from "src/palette/searchHistory";

/**
 * Persistence policy is isolated from the settings UI so schema migrations do
 * not depend on rendering controls or the Obsidian settings pane.
 */
export async function loadPluginSettings(plugin: MyPalettePlugin): Promise<void> {
	const data = await plugin.loadData();
	plugin.settings = mergeSettings(data);
	plugin.settings.searchHistory.entries = pruneStoredSearchHistory(
		plugin.settings.searchHistory.entries,
		Date.now(),
		plugin.settings.searchHistory.daysToKeep,
	);
	const storedSchemaVersion =
		data && typeof data === "object" && "schemaVersion" in data
			? (data as { schemaVersion?: unknown }).schemaVersion
			: undefined;
	if (
		typeof storedSchemaVersion === "number" &&
		storedSchemaVersion < plugin.settings.schemaVersion
	)
		await savePluginSettings(plugin);
}

export async function savePluginSettings(plugin: MyPalettePlugin): Promise<void> {
	await plugin.saveData(plugin.settings);
}
