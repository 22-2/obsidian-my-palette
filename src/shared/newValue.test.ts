import { describe, expect, it } from "vitest";
import { typedNewValue, type NewValueRules } from "src/shared/newValue";

const plain: NewValueRules = {
	normalize: (query) => query.trim(),
	isValid: (value) => !value.includes("\n"),
	keyOf: (value) => value,
};

describe("typedNewValue", () => {
	it("offers the normalized input when no known value matches", () => {
		expect(typedNewValue("  fresh ", ["old"], plain)).toBe("fresh");
	});

	it("offers nothing for empty, invalid, or already known input", () => {
		expect(typedNewValue("   ", [], plain)).toBeUndefined();
		expect(typedNewValue("a\nb", [], plain)).toBeUndefined();
		expect(typedNewValue("old", ["old"], plain)).toBeUndefined();
	});

	it("compares with the rule's key so case-insensitive matches count as known", () => {
		const caseless = { ...plain, keyOf: (value: string) => value.toLowerCase() };
		expect(typedNewValue("OLD", ["old"], caseless)).toBeUndefined();
	});
});
