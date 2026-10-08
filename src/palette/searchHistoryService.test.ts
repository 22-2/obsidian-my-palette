import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { SearchHistoryService } from "src/palette/searchHistoryService";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

const options = { now: 2_000, daysToKeep: 0, maxEntries: 256 };

describe("search history service", () => {
	it("mirrors history to the legacy payload when IndexedDB is unavailable", async () => {
		const onLegacyChange = vi.fn();
		const service = new SearchHistoryService(app(), vi.fn(), onLegacyChange);
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
