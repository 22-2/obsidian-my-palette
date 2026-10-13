import { describe, expect, it } from "vitest";
import { readList } from "src/properties/propertyList";

describe("readList", () => {
	it("reads arrays and single strings, and skips other values", () => {
		expect(readList(["a", 2, null, { b: 1 }])).toEqual(["a", "2"]);
		expect(readList("solo")).toEqual(["solo"]);
		expect(readList("")).toEqual([]);
		expect(readList(undefined)).toEqual([]);
	});
});
