import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { MAX_RECENT_TAGS, RecentTagStore } from "src/tags/recentTagStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("recent tag store", () => {
	it("moves recorded tags to the front and merges case-only duplicates", async () => {
		const store = new RecentTagStore(app());
		await store.load();

		store.record("Project", "todo");
		store.record("project", "new");

		expect(store.getIds()).toEqual(["project", "new", "todo"]);
		await store.dispose();
	});

	it("keeps only the newest tags", async () => {
		const store = new RecentTagStore(app());
		await store.load();
		store.record(...Array.from({ length: MAX_RECENT_TAGS + 5 }, (_, i) => `t${i}`));
		expect(store.getIds()).toHaveLength(MAX_RECENT_TAGS);
		expect(store.getIds()[0]).toBe("t0");
		await store.dispose();
	});
});
