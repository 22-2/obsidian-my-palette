import { describe, expect, it } from "vitest";
import { moveByInsertionIndex } from "src/settings/fileSortPriorityOrdering";

describe("file sort priority ordering", () => {
	it("moves an item to gaps above and below its source", () => {
		const items = ["alpha", "bravo", "charlie", "delta"];

		expect(moveByInsertionIndex(items, 2, 0)).toEqual(["charlie", "alpha", "bravo", "delta"]);
		expect(moveByInsertionIndex(items, 1, 4)).toEqual(["alpha", "charlie", "delta", "bravo"]);
	});

	it("keeps both gaps adjacent to the source as no-ops", () => {
		const items = ["alpha", "bravo", "charlie"];

		expect(moveByInsertionIndex(items, 1, 1)).toBe(items);
		expect(moveByInsertionIndex(items, 1, 2)).toBe(items);
	});
});
