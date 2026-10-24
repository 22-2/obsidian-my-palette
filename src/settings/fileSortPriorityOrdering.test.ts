import { describe, expect, it } from "vitest";
import { moveByInsertionIndex } from "src/settings/fileSortPriorityOrdering";

describe("ファイルソートの優先順位", () => {
	it("アイテムをソースの上下のギャップに移動します", () => {
		const items = ["alpha", "bravo", "charlie", "delta"];

		expect(moveByInsertionIndex(items, 2, 0)).toEqual(["charlie", "alpha", "bravo", "delta"]);
		expect(moveByInsertionIndex(items, 1, 4)).toEqual(["alpha", "charlie", "delta", "bravo"]);
	});

	it("ソースに隣接する両方のギャップを no-ops として保持します", () => {
		const items = ["alpha", "bravo", "charlie"];

		expect(moveByInsertionIndex(items, 1, 1)).toBe(items);
		expect(moveByInsertionIndex(items, 1, 2)).toBe(items);
	});
});
