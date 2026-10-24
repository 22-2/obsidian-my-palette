import { describe, expect, it } from "vitest";
import { formatPropertyValue, propertyKindOf } from "src/properties/propertyKind";

describe("プロパティの種類", () => {
	it("保存されている値が何であれ、予約キーを修正します", () => {
		expect(propertyKindOf("tags", "x")).toBe("tags");
		expect(propertyKindOf("aliases", "x", "text")).toBe("list");
		expect(propertyKindOf("cssclasses", undefined)).toBe("list");
	});

	it("値の前に宣言された型を使用します", () => {
		expect(propertyKindOf("status", "done", "text")).toBe("text");
		expect(propertyKindOf("status", "done", "multitext")).toBe("list");
		expect(propertyKindOf("due", "2026-10-13", "datetime")).toBe("datetime");
	});

	it("型が宣言されていない場合は、値から種類を推測します。", () => {
		expect(propertyKindOf("labels", ["a"])).toBe("list");
		expect(propertyKindOf("done", true)).toBe("checkbox");
		expect(propertyKindOf("rating", 4)).toBe("number");
		expect(propertyKindOf("day", "2026-10-13")).toBe("date");
		expect(propertyKindOf("at", "2026-10-13T09:30")).toBe("datetime");
		expect(propertyKindOf("at", "2026-10-13T09:30:15")).toBe("datetime");
		expect(propertyKindOf("memo", "hello")).toBe("text");
		expect(propertyKindOf("empty", undefined)).toBe("text");
	});

	it("別のキーで宣言されたタグ タイプをリストとして扱います", () => {
		expect(propertyKindOf("topics", ["a"], "tags")).toBe("list");
	});

	it("ネストされたオブジェクトをここでは編集不可としてマークします", () => {
		expect(propertyKindOf("meta", { a: 1 })).toBe("unsupported");
		expect(propertyKindOf("meta", { a: 1 }, "text")).toBe("unsupported");
	});

	it("宣言された型が不明な場合は値に戻ります", () => {
		expect(propertyKindOf("x", true, "somethingNew")).toBe("checkbox");
	});
});

describe("フォーマットプロパティ値", () => {
	it("結合されたリストと欠損値を「未設定」として表示します", () => {
		expect(formatPropertyValue("list", ["a", "b"])).toBe("a, b");
		expect(formatPropertyValue("text", undefined)).toBe("未設定");
		expect(formatPropertyValue("text", "")).toBe("未設定");
		expect(formatPropertyValue("number", 4)).toBe("4");
	});

	it("入れ子になった値をプレースホルダーの後ろに隠します", () => {
		expect(formatPropertyValue("unsupported", { a: 1 })).toBe("{…}");
	});
});
