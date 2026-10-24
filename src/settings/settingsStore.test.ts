import type MyPalettePlugin from "src/main";
import { SETTINGS_SCHEMA_VERSION } from "src/settings/model";
import { describe, expect, it } from "vitest";
import { loadPluginSettings, savePluginSettings } from "src/settings/settingsStore";

describe("設定ストア", () => {
	it("移行のためにレガシー履歴を抽出し、通常の保存から除外します", async () => {
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

	describe("決定を保存する", () => {
		const load = (data: unknown) =>
			loadPluginSettings({ loadData: async () => data } as unknown as MyPalettePlugin);

		it("保存されているスキーマが現在のスキーマよりも古い場合に保存します", async () => {
			const loaded = await load({ schemaVersion: SETTINGS_SCHEMA_VERSION - 1 });
			expect(loaded.shouldSave).toBe(true);
		});

		it("スキーマが最新でレガシー データがない場合は保存されません", async () => {
			const loaded = await load({ schemaVersion: SETTINGS_SCHEMA_VERSION });
			expect(loaded.shouldSave).toBe(false);
		});

		it("初回実行データは保存されません", async () => {
			const loaded = await load(null);
			expect(loaded.shouldSave).toBe(false);
		});
	});
});
