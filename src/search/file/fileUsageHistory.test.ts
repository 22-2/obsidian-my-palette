import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import {
	calculateFileUsageScore,
	FILE_USAGE_MAX_FREQUENCY,
	FILE_USAGE_RECENCY_HALF_LIFE_MS,
	FileUsageHistory,
} from "src/search/file/fileUsageHistory";

describe("file usage history scoring", () => {
	it("decays recent usage by the configured half-life", () => {
		const now = FILE_USAGE_RECENCY_HALF_LIFE_MS * 2;
		const recent = calculateFileUsageScore({ count: 1, lastUsedAt: now }, now);
		const oneHalfLifeAgo = calculateFileUsageScore(
			{ count: 1, lastUsedAt: now - FILE_USAGE_RECENCY_HALF_LIFE_MS },
			now,
		);

		expect(oneHalfLifeAgo).toBeCloseTo(recent / 2, 8);
	});

	it("rewards repeated usage without allowing frequency to grow forever", () => {
		const now = 1_000_000;
		const once = calculateFileUsageScore({ count: 1, lastUsedAt: now }, now);
		const often = calculateFileUsageScore(
			{ count: FILE_USAGE_MAX_FREQUENCY, lastUsedAt: now },
			now,
		);
		const beyondCap = calculateFileUsageScore(
			{ count: FILE_USAGE_MAX_FREQUENCY * 10, lastUsedAt: now },
			now,
		);

		expect(often).toBeGreaterThan(once);
		expect(beyondCap).toBe(often);
		expect(often).toBeLessThanOrEqual(1);
	});

	it("clamps future timestamps and rejects invalid records", () => {
		const now = 1_000_000;

		expect(
			calculateFileUsageScore(
				{ count: 1, lastUsedAt: now + FILE_USAGE_RECENCY_HALF_LIFE_MS },
				now,
			),
		).toBe(calculateFileUsageScore({ count: 1, lastUsedAt: now }, now));
		expect(calculateFileUsageScore({ count: 0, lastUsedAt: now }, now)).toBe(0);
		expect(calculateFileUsageScore({ count: 1, lastUsedAt: Number.NaN }, now)).toBe(0);
	});

	it("keeps the in-memory signal when IndexedDB is unavailable", async () => {
		const app = {
			vault: { adapter: {}, getName: () => "test-vault" },
		} as unknown as App;
		const history = new FileUsageHistory(app);

		history.record("notes/used.md", 1_000_000);

		expect(history.getScores(1_000_000).get("notes/used.md")).toBeGreaterThan(0);
		await history.dispose();
	});
});
