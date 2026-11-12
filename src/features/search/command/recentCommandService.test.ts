import type { App } from "obsidian";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logger } from "src/core/logger";
import { RecentCommandService } from "src/features/search/command/recentCommandService";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("最近のコマンドサービス", () => {
	// テストには IndexedDB が無く、読み込みのたびに「使用できない」エラーが出るので黙らせる。
	beforeEach(() => {
		vi.spyOn(logger, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("IndexedDB が使用できない場合は、最近の ID を従来のペイロードにミラーリングします。", async () => {
		const onLegacyChange = vi.fn();
		const service = new RecentCommandService(app(), onLegacyChange);
		expect(service.getLegacyIds()).toBeUndefined();

		await service.load(["a", "b"]);
		expect(service.getLegacyIds()).toEqual(["a", "b"]);

		service.record("b");
		expect(onLegacyChange).toHaveBeenCalledTimes(1);
		expect(service.getIds()).toEqual(["b", "a"]);
		expect(service.getLegacyIds()).toEqual(["b", "a"]);
		await service.dispose();
	});
});
