import { describe, expect, it } from "vitest";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/settings/model";
import {
	formatSearchHistoryInput,
	getSearchHistorySuggestions,
	parseStoredSearchHistoryEntries,
	pruneStoredSearchHistory,
	recordSearchHistory,
} from "src/palette/searchHistory";

describe("search history", () => {
	it("increments a committed search and merges case-only duplicates", () => {
		const first = recordSearchHistory([], "report", "everything", {
			now: 1_000,
			daysToKeep: 360,
			maxEntries: 256,
		});
		const second = recordSearchHistory(first, "REPORT", "everything", {
			now: 2_000,
			daysToKeep: 360,
			maxEntries: 256,
		});

		expect(second).toEqual([
			{ input: "REPORT", category: "everything", lastSearchedAt: 2_000, count: 2 },
		]);
	});

	it("keeps whitespace-sensitive entries distinct", () => {
		const entries = recordSearchHistory(
			recordSearchHistory([], "report", "file", {
				now: 1_000,
				daysToKeep: 0,
				maxEntries: 256,
			}),
			"report ",
			"file",
			{ now: 2_000, daysToKeep: 0, maxEntries: 256 },
		);

		expect(entries.map(({ input }) => input)).toEqual(["report ", "report"]);
	});

	it("prunes old entries and limits suggestions", () => {
		const now = 10 * 24 * 60 * 60 * 1000;
		const entries = pruneStoredSearchHistory(
			[
				{ input: "old", category: "file", lastSearchedAt: 0, count: 4 },
				{ input: "new", category: "file", lastSearchedAt: now, count: 1 },
			],
			now,
			7,
		);

		expect(
			getSearchHistorySuggestions(entries, "", "file", 1).map(({ input }) => input),
		).toEqual(["new"]);
	});

	it("filters suggestions by the current input", () => {
		const entries = [
			{
				input: "Open daily note",
				category: "file" as const,
				lastSearchedAt: 3_000,
				count: 1,
			},
			{ input: "Search report", category: "file" as const, lastSearchedAt: 2_000, count: 4 },
			{
				input: "Weekly review",
				category: "command" as const,
				lastSearchedAt: 1_000,
				count: 2,
			},
		];

		expect(
			getSearchHistorySuggestions(entries, "REPORT", "file").map(({ input }) => input),
		).toEqual(["Search report"]);
	});

	it("keeps identical queries separate across categories", () => {
		const entries = recordSearchHistory(
			recordSearchHistory([], "report", "file", {
				now: 1_000,
				daysToKeep: 0,
				maxEntries: 256,
			}),
			"report",
			"everything",
			{ now: 2_000, daysToKeep: 0, maxEntries: 256 },
		);

		expect(entries).toHaveLength(2);
		expect(getSearchHistorySuggestions(entries, "report", "everything")).toEqual([
			{ input: "report", category: "everything", lastSearchedAt: 2_000, count: 1 },
		]);
	});

	it("keeps ignored-note scope separate from the normal file search", () => {
		const entries = recordSearchHistory(
			recordSearchHistory([], "archive", "file", {
				now: 1_000,
				daysToKeep: 0,
				maxEntries: 256,
			}),
			"archive",
			"file",
			{ now: 2_000, daysToKeep: 0, maxEntries: 256, includeIgnored: true },
		);

		expect(entries).toHaveLength(2);
		expect(getSearchHistorySuggestions(entries, "archive", "file", 30, true)).toHaveLength(1);
		expect(getSearchHistorySuggestions(entries, "archive", "file", 30, false)).toHaveLength(1);
	});

	it("parses legacy entries before IndexedDB migration", () => {
		expect(
			parseStoredSearchHistoryEntries(
				[
					{ input: "i old note", lastSearchedAt: 10, count: 2 },
					{ input: "> build", category: "command", lastSearchedAt: 20, count: 0 },
					{ input: "report", category: "unknown", lastSearchedAt: 30, count: 1 },
					{ input: 42, lastSearchedAt: 40, count: 1 },
				],
				{ command: ">", everything: "e ", includeIgnored: "i " },
			),
		).toEqual([
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
				lastSearchedAt: 20,
				count: 1,
			},
			{
				input: "report",
				category: "file",
				lastSearchedAt: 30,
				count: 1,
			},
		]);
	});
});

describe("formatSearchHistoryInput", () => {
	const prefixes = { command: ">", everything: "es", includeIgnored: "i" };
	const entry = (
		category: SearchHistoryCategory,
		includeIgnored?: boolean,
	): SearchHistoryEntry => ({
		input: "foo",
		category,
		includeIgnored,
		lastSearchedAt: 1,
		count: 1,
	});

	it.each([
		["file", "foo"],
		["command", "> foo"],
		["bookmark", "bk foo"],
		["smart", "sc foo"],
		["everything", "es foo"],
		["everything-directory", "esdir foo"],
		["link", "o foo"],
		["backlink", "b foo"],
	] as const)("restores the %s prefix", (category, expected) => {
		expect(formatSearchHistoryInput(entry(category), prefixes)).toBe(expected);
	});

	it("adds the ignored-note prefix except for related searches", () => {
		expect(formatSearchHistoryInput(entry("file", true), prefixes)).toBe("i foo");
		expect(formatSearchHistoryInput(entry("command", true), prefixes)).toBe("i > foo");
		expect(formatSearchHistoryInput(entry("link", true), prefixes)).toBe("o foo");
		expect(formatSearchHistoryInput(entry("backlink", true), prefixes)).toBe("b foo");
	});
});
