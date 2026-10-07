import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	SETTING_LIMITS,
	SETTINGS_SCHEMA_VERSION,
	UNLIMITED_DAYS,
} from "src/settings/model";
import { mergeSettings } from "src/settings/mergeSettings";

describe("mergeSettings", () => {
	it("enables independent folder demotion once for existing configured folders", () => {
		const settings = mergeSettings({
			schemaVersion: 17,
			file: {
				demotedPriorFolders: ["archive"],
				sortPriorities: { blank: ["Activity"], input: ["Filename fuzzy match"] },
			},
		});
		expect(settings.file.sortPriorities).toEqual({
			blank: ["Lower prior folders", "Activity"],
			input: ["Lower prior folders", "Filename fuzzy match"],
		});
		settings.file.sortPriorities.blank = ["Activity"];
		expect(mergeSettings(settings).file.sortPriorities.blank).toEqual(["Activity"]);
	});

	it("migrates shared highlighting into independent surface preferences", () => {
		const settings = mergeSettings({ schemaVersion: 16, highlightSearchMatches: false });
		expect(settings.paletteDisplay).toEqual({
			table: { highlightSearchMatches: false },
			view: { highlightSearchMatches: false },
			palette: { highlightSearchMatches: false },
		});
		expect(settings.paletteDisplay.table).not.toBe(settings.paletteDisplay.view);
		expect(settings).not.toHaveProperty("highlightSearchMatches");
	});

	it("restores each surface and sanitizes invalid display preferences", () => {
		expect(
			mergeSettings({
				paletteDisplay: {
					table: { highlightSearchMatches: false },
					view: { highlightSearchMatches: "false" },
					palette: null,
				},
			}).paletteDisplay,
		).toEqual({
			table: { highlightSearchMatches: false },
			view: { highlightSearchMatches: true },
			palette: { highlightSearchMatches: true },
		});
	});

	it("fills missing data with the documented defaults", () => {
		expect(mergeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
	});

	it("defaults history retention to unlimited", () => {
		expect(DEFAULT_SETTINGS.searchHistory.addDelayMs).toBe(0);
		expect(DEFAULT_SETTINGS.searchHistory.daysToKeep).toBe(UNLIMITED_DAYS);
		expect(mergeSettings({ searchHistory: {} }).searchHistory.daysToKeep).toBe(UNLIMITED_DAYS);
	});

	it("migrates the old idle-history default to action-only history", () => {
		expect(
			mergeSettings({
				schemaVersion: 11,
				searchHistory: { addDelayMs: 3_000 },
			}).searchHistory.addDelayMs,
		).toBe(0);
		expect(
			mergeSettings({
				schemaVersion: SETTINGS_SCHEMA_VERSION,
				searchHistory: { addDelayMs: 3_000 },
			}).searchHistory.addDelayMs,
		).toBe(3_000);
		expect(
			mergeSettings({
				schemaVersion: SETTINGS_SCHEMA_VERSION - 1,
				searchHistory: { addDelayMs: 3_000 },
			}).searchHistory.addDelayMs,
		).toBe(3_000);
	});

	it("defaults file sorting to relevance, prior, and recency", () => {
		expect(mergeSettings(undefined).file.sortPriorities).toEqual({
			blank: ["Activity", "Last modified", "@prior:desc"],
			input: [
				"Filename prefix match",
				"Filename fuzzy match",
				"Alias prefix match",
				"Alias fuzzy match",
				"Tag match",
				"Match coverage",
				"Folder path match",
				"@prior:desc",
				"Activity",
				"Last modified",
			],
		});
	});

	it("bounds numeric settings and sanitizes extensions", () => {
		const settings = mergeSettings({
			searchHistory: { addDelayMs: -1, daysToKeep: 99999 },
			everything: {
				maxResults: 999,
				debounceMs: 1,
				requestTimeoutMs: 99999,
				vaultExtensions: [".MD", "md", "bad value", 42],
			},
		});

		expect(settings.searchHistory.addDelayMs).toBe(0);
		expect(settings.searchHistory.daysToKeep).toBe(SETTING_LIMITS.searchHistory.daysToKeep.max);
		expect(settings.everything.maxResults).toBe(SETTING_LIMITS.everything.maxResults.max);
		expect(settings.everything.debounceMs).toBe(SETTING_LIMITS.everything.debounceMs.min);
		expect(settings.everything.requestTimeoutMs).toBe(
			SETTING_LIMITS.everything.requestTimeoutMs.max,
		);
		expect(settings.everything.vaultExtensions).toEqual(["md"]);
	});

	it("normalizes configured file sort priorities and ignores invalid values", () => {
		const settings = mergeSettings({
			file: {
				sortPriorities: [
					" @prior:asc ",
					"Aliases count",
					"Last opened",
					"Usage history",
					"@title:desc",
					42,
					"unknown",
				],
			},
		});

		expect(settings.file.sortPriorities).toEqual({
			blank: ["@prior:asc", "Aliases count", "Activity"],
			input: ["@prior:asc", "Aliases count", "Activity"],
		});
	});

	it("migrates the previous combined name priorities", () => {
		const settings = mergeSettings({
			schemaVersion: 9,
			file: {
				sortPriorities: [
					"Prefix name match",
					"Fuzzy name match",
					"@prior:desc",
					"Last opened",
					"Last modified",
				],
			},
		});

		expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
		expect(settings.file.sortPriorities.blank).toEqual([
			"Activity",
			"Last modified",
			"@prior:desc",
		]);
		expect(settings.file.sortPriorities.input).toEqual([
			"Filename prefix match",
			"Filename fuzzy match",
			"Alias prefix match",
			"Alias fuzzy match",
			"Tag match",
			"Match coverage",
			"Folder path match",
			"@prior:desc",
			"Activity",
			"Last modified",
		]);
	});

	it("adds the tag priority to untouched previous defaults", () => {
		const settings = mergeSettings({
			schemaVersion: 10,
			file: {
				sortPriorities: [
					"Filename prefix match",
					"Filename fuzzy match",
					"Alias prefix match",
					"Alias fuzzy match",
					"Path fuzzy match",
					"@prior:desc",
					"Last opened",
					"Last modified",
				],
			},
		});

		expect(settings.schemaVersion).toBe(SETTINGS_SCHEMA_VERSION);
		expect(settings.file.sortPriorities).toEqual(DEFAULT_SETTINGS.file.sortPriorities);
	});

	it("adds Activity to untouched previous defaults", () => {
		const settings = mergeSettings({
			schemaVersion: 13,
			file: {
				sortPriorities: [
					"Filename prefix match",
					"Filename fuzzy match",
					"Alias prefix match",
					"Alias fuzzy match",
					"Tag match",
					"Path fuzzy match",
					"@prior:desc",
					"Last opened",
					"Last modified",
				],
			},
		});

		expect(settings.file.sortPriorities).toEqual(DEFAULT_SETTINGS.file.sortPriorities);
	});

	it("migrates the previous Activity default", () => {
		const settings = mergeSettings({
			schemaVersion: SETTINGS_SCHEMA_VERSION,
			file: {
				sortPriorities: [
					"Filename prefix match",
					"Filename fuzzy match",
					"Alias prefix match",
					"Alias fuzzy match",
					"Tag match",
					"Match coverage",
					"Path fuzzy match",
					"@prior:desc",
					"Last opened",
					"Usage history",
					"Last modified",
				],
			},
		});

		expect(settings.file.sortPriorities).toEqual(DEFAULT_SETTINGS.file.sortPriorities);
	});

	it("preserves independent sort priorities for blank and typed input", () => {
		const settings = mergeSettings({
			file: {
				sortPriorities: {
					blank: ["Last opened", "Last modified"],
					input: ["Filename fuzzy match", "@prior:desc"],
				},
			},
		});

		expect(settings.file.sortPriorities).toEqual({
			blank: ["Activity", "Last modified"],
			input: ["Filename fuzzy match", "@prior:desc"],
		});
	});
});
