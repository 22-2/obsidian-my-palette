import { describe, expect, it } from "vitest";
import {
	getSearchHistorySuggestions,
	pruneStoredSearchHistory,
	recordSearchHistory,
} from "src/core/searchHistory";

describe("search history", () => {
	it("records after an idle interval and merges case-only duplicates", () => {
		const first = recordSearchHistory([], "e report", {
			now: 1_000,
			daysToKeep: 360,
			maxEntries: 256,
		});
		const second = recordSearchHistory(first, "e REPORT", {
			now: 2_000,
			daysToKeep: 360,
			maxEntries: 256,
		});

		expect(second).toEqual([{ input: "e REPORT", lastSearchedAt: 2_000, count: 2 }]);
	});

	it("keeps whitespace-sensitive entries distinct", () => {
		const entries = recordSearchHistory(
			recordSearchHistory([], "report", {
				now: 1_000,
				daysToKeep: 0,
				maxEntries: 256,
			}),
			"report ",
			{ now: 2_000, daysToKeep: 0, maxEntries: 256 },
		);

		expect(entries.map(({ input }) => input)).toEqual(["report ", "report"]);
	});

	it("prunes old entries and limits suggestions", () => {
		const now = 10 * 24 * 60 * 60 * 1000;
		const entries = pruneStoredSearchHistory(
			[
				{ input: "old", lastSearchedAt: 0, count: 4 },
				{ input: "new", lastSearchedAt: now, count: 1 },
			],
			now,
			7,
		);

		expect(getSearchHistorySuggestions(entries, "", 1).map(({ input }) => input)).toEqual([
			"new",
		]);
	});
});
