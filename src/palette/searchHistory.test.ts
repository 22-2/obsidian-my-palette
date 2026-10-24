import { describe, expect, it } from "vitest";
import {
	DEFAULT_SETTINGS,
	type SearchHistoryCategory,
	type SearchHistoryEntry,
} from "src/settings/model";
import {
	formatSearchHistoryInput,
	getSearchHistorySuggestions,
	normalizeSearchHistoryEntry,
	parseStoredSearchHistoryEntries,
	pruneStoredSearchHistory,
	recordSearchHistory,
} from "src/palette/searchHistory";

describe("検索履歴", () => {
	it("統合されたすべてのスイッチで廃止されたすべてのファイルのスコープを復元します", () => {
		const stored = {
			input: "report",
			category: "everything-directory",
			lastSearchedAt: 1_000,
			count: 1,
		};
		expect(normalizeSearchHistoryEntry(stored)?.includeIgnored).toBe(true);
		expect(
			parseStoredSearchHistoryEntries([stored], DEFAULT_SETTINGS.modes)[0]?.includeIgnored,
		).toBe(true);
	});
	it.each([
		"tag-insertion",
		"moc-insertion",
		"folder-move",
		"bulk-rename",
		"merge-target",
	] as const)("preserves %s entries through storage normalization", (category) => {
		const entry = { input: "i example", category, lastSearchedAt: 1_000, count: 1 };
		const normalized = parseStoredSearchHistoryEntries([entry], DEFAULT_SETTINGS.modes);
		expect(normalized).toEqual([{ ...entry, includeIgnored: undefined }]);
		expect(formatSearchHistoryInput(entry, DEFAULT_SETTINGS.modes)).toBe("i example");
		expect(getSearchHistorySuggestions(normalized, "", "file")).toEqual([]);
		expect(getSearchHistorySuggestions(normalized, "", category)).toEqual(normalized);
	});

	it("コミットされた検索を増分し、ケースのみの重複をマージします", () => {
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

	it("空白を含むエントリを区別しておく", () => {
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

	it("古いエントリを削除し、提案を制限します", () => {
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

	it("現在の入力によって提案をフィルタリングします", () => {
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

	it("同一のクエリをカテゴリ間で分けて保持します", () => {
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

	it("Obsidian を除外したスコープを通常のファイル検索から分離します。", () => {
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

	it("IndexedDB の移行前にレガシー エントリを解析します", () => {
		expect(
			parseStoredSearchHistoryEntries(
				[
					{ input: "i old note", lastSearchedAt: 10, count: 2 },
					{ input: "> build", category: "command", lastSearchedAt: 20, count: 0 },
					{ input: "report", category: "unknown", lastSearchedAt: 30, count: 1 },
					{ input: 42, lastSearchedAt: 40, count: 1 },
				],
				DEFAULT_SETTINGS.modes,
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

describe("フォーマット検索履歴入力", () => {
	const modes = { ...DEFAULT_SETTINGS.modes, everything: { alias: "es", enabled: true } };
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
		["everything-directory", "es foo"],
		["link", "o foo"],
		["backlink", "b foo"],
	] as const)("restores the %s prefix", (category, expected) => {
		expect(formatSearchHistoryInput(entry(category), modes)).toBe(expected);
	});

	it("Obsidian 除外スコープをホストのスイッチに残します", () => {
		expect(formatSearchHistoryInput(entry("file", true), modes)).toBe("foo");
		expect(formatSearchHistoryInput(entry("command", true), modes)).toBe("> foo");
	});
});
