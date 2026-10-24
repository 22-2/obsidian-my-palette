import { describe, expect, it } from "vitest";
import { typedNewValue, type NewValueRules } from "src/shared/newValue";

const plain: NewValueRules = {
	normalize: (query) => query.trim(),
	isValid: (value) => !value.includes("\n"),
	keyOf: (value) => value,
};

describe("入力された新しい値", () => {
	it("一致する既知の値がない場合に正規化された入力を提供します", () => {
		expect(typedNewValue("  fresh ", ["old"], plain)).toBe("fresh");
	});

	it("空、無効、または既知の入力に対しては何も提供しません", () => {
		expect(typedNewValue("   ", [], plain)).toBeUndefined();
		expect(typedNewValue("a\nb", [], plain)).toBeUndefined();
		expect(typedNewValue("old", ["old"], plain)).toBeUndefined();
	});

	it("ルールのキーと比較するため、大文字と小文字を区別しない一致は既知のものとしてカウントされます", () => {
		const caseless = { ...plain, keyOf: (value: string) => value.toLowerCase() };
		expect(typedNewValue("OLD", ["old"], caseless)).toBeUndefined();
	});
});
