import type { App } from "obsidian";
import { IntegrationAvailability } from "src/app/integrationAvailability";
import { DEFAULT_SETTINGS, type SearchHistoryEntry } from "src/settings/model";
import { PaletteDisplaySettingsStore } from "src/settings/paletteDisplaySettingsStore";
import { getSearchHistorySuggestions, recordSearchHistory } from "src/palette/searchHistory";
import type { SelectorControls } from "src/ui/selectorControls";

/** Real history filtering and display subscriptions with an in-memory test store. */
export function createSelectorPlugin(app = {} as App): SelectorControls["plugin"] {
	const settings = structuredClone(DEFAULT_SETTINGS);
	let entries: SearchHistoryEntry[] = [];
	return {
		app,
		settings,
		integrationAvailability: new IntegrationAvailability(
			() => settings,
			async () => ({ ok: false, message: "Not configured" }),
			() => false,
		),
		paletteDisplaySettings: new PaletteDisplaySettingsStore(
			() => settings,
			async () => {},
		),
		clearSearchHistoryCategories: (categories) => {
			entries = entries.filter((entry) => !categories.includes(entry.category));
		},
		getSearchHistorySuggestions: (input, category, includeIgnored = false) =>
			getSearchHistorySuggestions(entries, input, category, 30, includeIgnored).map(
				(entry) => ({
					...entry,
					id: `search-history:${entry.category}:${entry.input}`,
					mode: "search-history",
					primary: entry.input,
					secondary: "Search history",
					icon: "history",
				}),
			),
		recordSearch: (input, category, includeIgnored = false) => {
			if (!settings.searchHistory.enabled || !input.trim()) return;
			entries = recordSearchHistory(entries, input, category, {
				now: Date.now(),
				daysToKeep: settings.searchHistory.daysToKeep,
				maxEntries: 256,
				includeIgnored,
			});
		},
	};
}
