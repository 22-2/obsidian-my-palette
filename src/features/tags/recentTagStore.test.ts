import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "src/core/logger";
import { MAX_RECENT_TAGS, RecentTagStore } from "src/features/tags/recentTagStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("最近のタグストア", () => {
	// テストには IndexedDB が無く、読み込みのたびに「使用できない」エラーが出るので黙らせる。
	beforeEach(() => {
		vi.spyOn(logger, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

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
