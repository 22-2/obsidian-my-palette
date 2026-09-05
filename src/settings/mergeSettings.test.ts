import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	SETTING_LIMITS,
	SETTINGS_SCHEMA_VERSION,
	UNLIMITED_DAYS,
} from "src/model/settings";
import { mergeSettings } from "src/settings/mergeSettings";

describe("mergeSettings", () => {
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
	});

	it("defaults file sorting to relevance, prior, and recency", () => {
		expect(mergeSettings(undefined).file.sortPriorities).toEqual({
			blank: [
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

	it("bounds numeric settings and sanitizes extension and command lists", () => {
		const settings = mergeSettings({
			searchHistory: { addDelayMs: -1, daysToKeep: 99999 },
			everything: {
				maxResults: 999,
				debounceMs: 1,
				requestTimeoutMs: 99999,
				vaultExtensions: [".MD", "md", "bad value", 42],
			},
			recentCommandIds: ["first", 42, "second", "third"],
		});

		expect(settings.searchHistory.addDelayMs).toBe(0);
		expect(settings.searchHistory.daysToKeep).toBe(SETTING_LIMITS.searchHistory.daysToKeep.max);
		expect(settings.everything.maxResults).toBe(SETTING_LIMITS.everything.maxResults.max);
		expect(settings.everything.debounceMs).toBe(SETTING_LIMITS.everything.debounceMs.min);
		expect(settings.everything.requestTimeoutMs).toBe(
			SETTING_LIMITS.everything.requestTimeoutMs.max,
		);
		expect(settings.everything.vaultExtensions).toEqual(["md"]);
		expect(settings.recentCommandIds).toEqual(["first", "second", "third"]);
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
		expect(settings.file.sortPriorities.input).toEqual(settings.file.sortPriorities.blank);
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

	it("migrates legacy history entries through the current prefix parser", () => {
		const settings = mergeSettings({
			searchHistory: {
				entries: [
					{ input: "i old note", lastSearchedAt: 10, count: 2 },
					{ input: "> build", category: "command", lastSearchedAt: 20, count: 0 },
					{ input: "report", category: "unknown", lastSearchedAt: 30, count: 1 },
					{ input: 42, lastSearchedAt: 40, count: 1 },
				],
			},
		});

		expect(settings.searchHistory.entries).toEqual([
			{
				input: "old note",
				category: "file",
				includeIgnored: true,
				lastSearchedAt: 10,
				count: 2,
			},
			{
				input: "> build",
				category: "command",
				includeIgnored: false,
				lastSearchedAt: 20,
				count: 1,
			},
			{
				input: "report",
				category: "file",
				includeIgnored: false,
				lastSearchedAt: 30,
				count: 1,
			},
		]);
	});
});
