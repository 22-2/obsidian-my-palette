import type { App } from "obsidian";
import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "src/core/logger";
import { RecentCommandStore } from "src/features/search/command/recentCommandStore";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("最近のコマンドストア", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("IndexedDB が使用できない場合でも、最近のコマンドを使用できるようにする", async () => {
		const error = vi.spyOn(logger, "error").mockImplementation(() => undefined);
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

		// 使えないと分かった後の書き込みでは、同じエラーを繰り返し出さない。
		expect(error).toHaveBeenCalledTimes(1);
		expect(error).toHaveBeenCalledWith(
			"IndexedDB for recent commands is unavailable",
			expect.any(Error),
		);
	});
});
