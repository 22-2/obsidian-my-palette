import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { RecentCommandStore } from "src/search/command/recentCommandStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("recent command store", () => {
	it("keeps recent commands usable when IndexedDB is unavailable", async () => {
		const store = new RecentCommandStore(app());
		const persistent = await store.load(["first", "second"]);

		expect(persistent).toBe(false);
		expect(store.getIds()).toEqual(["first", "second"]);

		store.record("second");
		store.record("third");

		expect(store.getIds()).toEqual(["third", "second", "first"]);

		store.clear();
		expect(store.getIds()).toEqual([]);
		await store.dispose();
	});
});
