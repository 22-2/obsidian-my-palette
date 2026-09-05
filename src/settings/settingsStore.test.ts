import type MyPalettePlugin from "src/main";
import { SETTINGS_SCHEMA_VERSION } from "src/model/settings";
import { describe, expect, it } from "vitest";
import { loadPluginSettings, savePluginSettings } from "src/settings/settingsStore";

describe("settings store", () => {
	it("extracts legacy history for migration and omits it from normal saves", async () => {
		let savedData: unknown;
		const plugin = {
			loadData: async () => ({
				schemaVersion: SETTINGS_SCHEMA_VERSION,
				searchHistory: {
					entries: [{ input: "i old note", lastSearchedAt: 10, count: 2 }],
				},
				recentCommandIds: ["first", 42, "second", "first"],
			}),
			saveData: async (data: unknown) => {
				savedData = data;
			},
		} as unknown as MyPalettePlugin;

		const loaded = await loadPluginSettings(plugin);

		expect(loaded.shouldSave).toBe(true);
		expect(loaded.legacySearchHistoryEntries).toEqual([
			{
				input: "old note",
				category: "file",
				includeIgnored: true,
				lastSearchedAt: 10,
				count: 2,
			},
		]);
		expect(loaded.legacyRecentCommandIds).toEqual(["first", "second"]);

		await savePluginSettings(plugin);
		expect(savedData).not.toHaveProperty("searchHistory.entries");
		expect(savedData).not.toHaveProperty("recentCommandIds");

		await savePluginSettings(
			plugin,
			loaded.legacySearchHistoryEntries,
			loaded.legacyRecentCommandIds,
		);
		expect(savedData).toHaveProperty(
			"searchHistory.entries",
			loaded.legacySearchHistoryEntries,
		);
		expect(savedData).toHaveProperty("recentCommandIds", ["first", "second"]);
	});
});
