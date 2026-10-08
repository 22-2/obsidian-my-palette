import type MyPalettePlugin from "src/main";
import { SETTINGS_SCHEMA_VERSION } from "src/settings/model";
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

	describe("save decision", () => {
		const load = (data: unknown) =>
			loadPluginSettings({ loadData: async () => data } as unknown as MyPalettePlugin);

		it("saves when the stored schema is older than the current one", async () => {
			const loaded = await load({ schemaVersion: SETTINGS_SCHEMA_VERSION - 1 });
			expect(loaded.shouldSave).toBe(true);
		});

		it("does not save when the schema is current and there is no legacy data", async () => {
			const loaded = await load({ schemaVersion: SETTINGS_SCHEMA_VERSION });
			expect(loaded.shouldSave).toBe(false);
		});

		it("does not save for first-run data", async () => {
			const loaded = await load(null);
			expect(loaded.shouldSave).toBe(false);
		});
	});
});
