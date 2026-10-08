import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { RecentCommandService } from "src/search/command/recentCommandService";

function app(): App {
	return {
		vault: { adapter: {}, getName: () => "test-vault" },
	} as unknown as App;
}

describe("recent command service", () => {
	it("mirrors recent ids to the legacy payload when IndexedDB is unavailable", async () => {
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
