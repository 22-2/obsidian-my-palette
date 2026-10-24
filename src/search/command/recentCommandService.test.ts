import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { RecentCommandService } from "src/search/command/recentCommandService";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("最近のコマンドサービス", () => {
	it("IndexedDB が使用できない場合は、最近の ID を従来のペイロードにミラーリングします。", async () => {
		const onLegacyChange = vi.fn();
		const service = new RecentCommandService(app(), vi.fn(), onLegacyChange);
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
