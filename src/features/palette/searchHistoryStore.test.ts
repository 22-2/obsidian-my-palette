import type { App } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "src/core/logger";
import { SearchHistoryStore } from "src/features/palette/searchHistoryStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("検索履歴ストア", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("IndexedDB が使用できない場合でもレガシー履歴を使用できるようにする", async () => {
		const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
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

		// 使えないと分かった後の書き込みでは、同じエラーを繰り返し出さない。
		expect(error).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledWith(
			"Search history IndexedDB is unavailable",
			expect.any(Error),
		);
	});
});
