import { describe, expect, it } from "vitest";
import { formatPropertyValue, propertyKindOf } from "src/properties/propertyKind";

describe("propertyKindOf", () => {
	it("fixes the reserved keys whatever their stored value is", () => {
		expect(propertyKindOf("tags", "x")).toBe("tags");
		expect(propertyKindOf("aliases", "x", "text")).toBe("list");
		expect(propertyKindOf("cssclasses", undefined)).toBe("list");
	});

	it("uses the declared type before the value", () => {
		expect(propertyKindOf("status", "done", "text")).toBe("text");
		expect(propertyKindOf("status", "done", "multitext")).toBe("list");
		expect(propertyKindOf("due", "2026-10-13", "datetime")).toBe("datetime");
	});

	it("infers the kind from the value when no type is declared", () => {
		expect(propertyKindOf("labels", ["a"])).toBe("list");
		expect(propertyKindOf("done", true)).toBe("checkbox");
		expect(propertyKindOf("rating", 4)).toBe("number");
		expect(propertyKindOf("day", "2026-10-13")).toBe("date");
		expect(propertyKindOf("at", "2026-10-13T09:30")).toBe("datetime");
		expect(propertyKindOf("at", "2026-10-13T09:30:15")).toBe("datetime");
		expect(propertyKindOf("memo", "hello")).toBe("text");
		expect(propertyKindOf("empty", undefined)).toBe("text");
	});

	it("treats a declared tags type on another key as a list", () => {
		expect(propertyKindOf("topics", ["a"], "tags")).toBe("list");
	});

	it("marks nested objects as not editable here", () => {
		expect(propertyKindOf("meta", { a: 1 })).toBe("unsupported");
		expect(propertyKindOf("meta", { a: 1 }, "text")).toBe("unsupported");
	});

	it("falls back to the value when the declared type is unknown", () => {
		expect(propertyKindOf("x", true, "somethingNew")).toBe("checkbox");
	});
});

describe("formatPropertyValue", () => {
	it("shows lists joined and missing values as Not set", () => {
		expect(formatPropertyValue("list", ["a", "b"])).toBe("a, b");
		expect(formatPropertyValue("text", undefined)).toBe("未設定");
		expect(formatPropertyValue("text", "")).toBe("未設定");
		expect(formatPropertyValue("number", 4)).toBe("4");
	});

	it("hides nested values behind a placeholder", () => {
		expect(formatPropertyValue("unsupported", { a: 1 })).toBe("{…}");
	});
});
