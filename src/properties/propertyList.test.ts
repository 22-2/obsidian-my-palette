import { describe, expect, it } from "vitest";
import { readList } from "src/properties/propertyList";

describe("読み取りリスト", () => {
	it("配列と単一の文字列を読み取り、他の値をスキップします", () => {
		expect(readList(["a", 2, null, { b: 1 }])).toEqual(["a", "2"]);
		expect(readList("solo")).toEqual(["solo"]);
		expect(readList("")).toEqual([]);
		expect(readList(undefined)).toEqual([]);
	});
});
