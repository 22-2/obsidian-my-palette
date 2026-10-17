import type MyPalettePlugin from "src/main";
import type { SearchHistoryEntry } from "src/settings/model";
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
 * 保存のルールは設定 UI から分けてあるので、スキーマの移行が操作の描画や Obsidian の設定画面に
 * 依存しない。
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
		parseStoredSearchHistoryEntries(rawSearchHistory.entries, plugin.settings.modes),
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
		// 古いスキーマや古い履歴のデータは、両方の保存先が移行を受け付けた後に書き直す必要がある。
		// data.json が予備を失わないように。
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
