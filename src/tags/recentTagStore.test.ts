import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { MAX_RECENT_TAGS, RecentTagStore } from "src/tags/recentTagStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("最近のタグストア", () => {
	it("記録されたタグを前面に移動し、大文字と小文字のみの重複をマージします", async () => {
		const store = new RecentTagStore(app());
		await store.load();

		store.record("Project", "todo");
		store.record("project", "new");

		expect(store.getIds()).toEqual(["project", "new", "todo"]);
		await store.dispose();
	});

	it("最新のタグのみを保持します", async () => {
		const store = new RecentTagStore(app());
		await store.load();
		store.record(...Array.from({ length: MAX_RECENT_TAGS + 5 }, (_, i) => `t${i}`));
		expect(store.getIds()).toHaveLength(MAX_RECENT_TAGS);
		expect(store.getIds()[0]).toBe("t0");
		await store.dispose();
	});
});
