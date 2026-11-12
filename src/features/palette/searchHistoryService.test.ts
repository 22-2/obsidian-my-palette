import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "src/core/logger";
import { SearchHistoryService } from "src/features/palette/searchHistoryService";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

const options = { now: 2_000, daysToKeep: 0, maxEntries: 256 };

describe("検索履歴サービス", () => {
	// テストには IndexedDB が無く、読み込みのたびに「使用できない」エラーが出るので黙らせる。
	beforeEach(() => {
		vi.spyOn(logger, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("IndexedDB が使用できない場合、履歴を従来のペイロードにミラーリングします。", async () => {
		const onLegacyChange = vi.fn();
		const service = new SearchHistoryService(app(), onLegacyChange);
		expect(service.getLegacyEntries()).toBeUndefined();

		await service.load(
			[{ input: "old", category: "file", lastSearchedAt: 1_000, count: 1 }],
			0,
		);
		expect(service.getLegacyEntries()?.map(({ input }) => input)).toEqual(["old"]);

		service.record("new", "file", options);
		expect(onLegacyChange).toHaveBeenCalledTimes(1);
		expect(service.getLegacyEntries()?.map(({ input }) => input)).toEqual(["new", "old"]);
		expect(service.getSuggestions("", "file").map(({ input }) => input)).toEqual([
			"new",
			"old",
		]);

		service.clear();
		expect(onLegacyChange).toHaveBeenCalledTimes(2);
		expect(service.getLegacyEntries()).toEqual([]);
		await service.dispose();
	});
});
