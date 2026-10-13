import { describe, expect, it, vi } from "vitest";
import { propertyValueText } from "src/properties/propertyMenu";

vi.mock("obsidian", async () => await import("src/ui/testing/obsidianDom"));

describe("propertyValueText", () => {
	it("copies a list one item per line", () => {
		expect(propertyValueText("list", ["a", "b"])).toBe("a\nb");
		expect(propertyValueText("tags", ["x"])).toBe("x");
	});

	it("copies scalars as they are and missing values as nothing", () => {
		expect(propertyValueText("text", "hello")).toBe("hello");
		expect(propertyValueText("number", 4)).toBe("4");
		expect(propertyValueText("checkbox", false)).toBe("false");
		expect(propertyValueText("text", undefined)).toBe("");
	});

	it("copies a nested value as JSON", () => {
		expect(propertyValueText("unsupported", { a: 1 })).toBe('{"a":1}');
	});
});
