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

	it("falls back to the default alias when a stored one is blank", () => {
		expect(
			mergeSettings({ modes: { commands: { alias: " " }, everything: { alias: "ev" } } })
				.modes,
		).toEqual({
			...DEFAULT_SETTINGS.modes,
			everything: { alias: "ev", enabled: true },
		});
	});

	it("keeps a mode enabled unless its stored settings turn it off", () => {
		expect(mergeSettings({ modes: { tabs: { alias: "t" } } }).modes.tabs).toEqual({
			alias: "t",
			enabled: true,
		});
		expect(
			mergeSettings({ modes: { tabs: { alias: "t", enabled: false } } }).modes.tabs.enabled,
		).toBe(false);
	});

	it("moves the schema 18 prefixes into the mode aliases without their trailing space", () => {
		const settings = mergeSettings({
			schemaVersion: 18,
			prefixes: { command: "c ", everything: "ev " },
		});
		expect(settings.modes.commands).toEqual({ alias: "c", enabled: true });
		expect(settings.modes.everything).toEqual({ alias: "ev", enabled: true });
		expect(settings).not.toHaveProperty("prefixes");
	});

	it("prefers a mode alias that is already stored over a leftover prefix", () => {
		expect(
			mergeSettings({
				schemaVersion: 19,
				modes: { commands: { alias: "c" } },
				prefixes: { command: "old " },
			}).modes.commands,
		).toEqual({ alias: "c", enabled: true });
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

describe("Notes mode migration", () => {
	it("chooses a free alias without changing existing aliases", () => {
		const settings = mergeSettings({
			modes: {
				commands: { alias: "N", enabled: true },
				tabs: { alias: "notes", enabled: true },
			},
		});
		expect(settings.modes.commands.alias).toBe("N");
		expect(settings.modes.notes.alias).toBe("notes2");
	});
});

describe("Plugins mode migration", () => {
	it("adds the mode with its default alias for existing settings", () => {
		const settings = mergeSettings({ modes: { tabs: { alias: "t" } } });
		expect(settings.modes.plugins).toEqual({ alias: "p", enabled: true });
	});

	it("moves the new mode aside when its alias is already taken", () => {
		const settings = mergeSettings({
			modes: { commands: { alias: "p", enabled: true } },
		});
		expect(settings.modes.commands.alias).toBe("p");
		expect(settings.modes.plugins.alias).toBe("plugins");
	});
});

describe("Snippets mode migration", () => {
	it("adds the mode with its default alias for existing settings", () => {
		const settings = mergeSettings({ modes: { tabs: { alias: "t" } } });
		expect(settings.modes.snippets).toEqual({ alias: "sn", enabled: true });
	});

	it("moves the new mode aside when its alias is already taken", () => {
		const settings = mergeSettings({
			modes: { smart: { alias: "sn", enabled: true } },
		});
		expect(settings.modes.smart.alias).toBe("sn");
		expect(settings.modes.snippets.alias).toBe("snippets");
	});
});

describe("Properties mode migration", () => {
	it("adds the mode with its default alias for existing settings", () => {
		const settings = mergeSettings({ modes: { snippets: { alias: "sn" } } });
		expect(settings.modes.properties).toEqual({ alias: "pr", enabled: true });
	});

	it("moves the new mode aside when its alias is already taken", () => {
		const settings = mergeSettings({
			modes: { smart: { alias: "pr", enabled: true } },
		});
		expect(settings.modes.smart.alias).toBe("pr");
		expect(settings.modes.properties.alias).toBe("properties");
	});
});

describe("merged Everything mode", () => {
	it("preserves its alias and keeps the mode enabled if either old scope was enabled", () => {
		const settings = mergeSettings({
			schemaVersion: 21,
			modes: {
				everything: { alias: "ev", enabled: false },
				"everything-all": { alias: "all", enabled: true },
			},
		});
		expect(settings.modes.everything).toEqual({ alias: "ev", enabled: true });
		expect(settings.modes).not.toHaveProperty("everything-all");
	});

	it("preserves a disabled merged mode after migration and uses the old all-files alias if needed", () => {
		expect(
			mergeSettings({
				schemaVersion: SETTINGS_SCHEMA_VERSION,
				modes: { everything: { alias: "ev", enabled: false } },
			}).modes.everything.enabled,
		).toBe(false);
		expect(
			mergeSettings({
				modes: { "everything-all": { alias: "all", enabled: true } },
			}).modes.everything.alias,
		).toBe("all");
	});
});

describe("Return to Home after", () => {
	it("turns the old remember-last-input switch into a time, keeping the default for new installs", () => {
		expect(mergeSettings({ rememberLastInput: false }).home).toEqual({
			returnAfterSeconds: 0,
		});
		expect(mergeSettings({ rememberLastInput: true }).home).toEqual({
			returnAfterSeconds: 90,
		});
		expect(mergeSettings(undefined).home).toEqual({ returnAfterSeconds: 90 });
	});

	it("keeps a stored time over the old switch, and drops the switch", () => {
		const settings = mergeSettings({
			rememberLastInput: false,
			home: { returnAfterSeconds: 60 },
		});
		expect(settings.home.returnAfterSeconds).toBe(60);
		expect(settings).not.toHaveProperty("rememberLastInput");
	});

	it("reads the time stored under the old launcher key and drops that key", () => {
		const settings = mergeSettings({ launcher: { popToRootAfterSeconds: 30 } });
		expect(settings.home.returnAfterSeconds).toBe(30);
		expect(settings).not.toHaveProperty("launcher");
	});
});

describe("audit settings", () => {
	it("defaults to orphaned files", () => {
		expect(mergeSettings({}).audit).toEqual(DEFAULT_SETTINGS.audit);
	});

	it("keeps a stored kind and drops the removed options", () => {
		const settings = mergeSettings({
			audit: {
				kind: "empty-files",
				excludedFolders: ["Archive"],
				excludedTags: ["draft"],
				excludedExtensions: ["csv"],
				excludeDailyNotesAndTemplates: false,
				mocOnlyAsEmpty: true,
				archiveFolder: "Archive/audit",
			},
		});
		expect(settings.audit).toEqual({ kind: "empty-files" });
		expect(mergeSettings({ audit: { kind: "unknown-kind" } }).audit.kind).toBe(
			"orphaned-files",
		);
	});
});

describe("audit mode alias", () => {
	it("uses `a`, or moves to `audit` when another mode already uses `a`", () => {
		expect(mergeSettings({}).modes.audit).toEqual({ alias: "a", enabled: true });
		expect(
			mergeSettings({ modes: { tabs: { alias: "a", enabled: true } } }).modes.audit.alias,
		).toBe("audit");
	});

	it("keeps the stored kind", () => {
		expect(mergeSettings({ audit: { kind: "broken-links" } }).audit.kind).toBe("broken-links");
	});
});
