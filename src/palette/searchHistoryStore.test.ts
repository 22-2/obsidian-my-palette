import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { SearchHistoryStore } from "src/palette/searchHistoryStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("検索履歴ストア", () => {
	it("IndexedDB が使用できない場合でもレガシー履歴を使用できるようにする", async () => {
		const store = new SearchHistoryStore(app());
		const persistent = await store.load([
			{ input: "old", category: "file", lastSearchedAt: 1_000, count: 2 },
		]);

		expect(persistent).toBe(false);
		expect(store.getSuggestions("", "file").map(({ input }) => input)).toEqual(["old"]);

		store.record("new", "file", {
			now: 2_000,
			daysToKeep: 0,
			maxEntries: 256,
		});
		store.record("OLD", "file", {
			now: 3_000,
			daysToKeep: 0,
			maxEntries: 256,
		});

		expect(store.getSuggestions("", "file").map(({ input }) => input)).toEqual(["OLD", "new"]);

		store.clear();
		expect(store.getSuggestions("", "file")).toEqual([]);
		await store.dispose();
	});
});
