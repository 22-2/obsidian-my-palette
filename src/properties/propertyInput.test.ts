import { describe, expect, it } from "vitest";
import { checkPropertyInput, propertyInputRows } from "src/properties/propertyInput";

describe("checkProperty入力", () => {
	it("あらゆるテキストとあらゆる種類の空の入力を受け入れます", () => {
		expect(checkPropertyInput("text", "  hi ")).toEqual({ ok: true, value: "  hi " });
		expect(checkPropertyInput("number", "  ")).toEqual({ ok: true, value: "" });
		expect(checkPropertyInput("date", "")).toEqual({ ok: true, value: "" });
	});

	it("数値を数値として書き込みます", () => {
		expect(checkPropertyInput("number", " 4.5 ")).toEqual({ ok: true, value: 4.5 });
		expect(checkPropertyInput("number", "abc")).toEqual({
			ok: false,
			reason: "数値を入力してください。",
		});
	});

	it("カレンダーと照らし合わせて日付をチェックする", () => {
		expect(checkPropertyInput("date", "2026-10-13")).toEqual({ ok: true, value: "2026-10-13" });
		expect(checkPropertyInput("date", "2026-02-30").ok).toBe(false);
		expect(checkPropertyInput("date", "2026/10/13").ok).toBe(false);
	});

	it("範囲内でのみオプションの秒を含む日付と時刻を受け入れます", () => {
		expect(checkPropertyInput("datetime", "2026-10-13T09:30").ok).toBe(true);
		expect(checkPropertyInput("datetime", "2026-10-13T09:30:15").ok).toBe(true);
		expect(checkPropertyInput("datetime", "2026-10-13T24:00").ok).toBe(false);
		expect(checkPropertyInput("datetime", "2026-10-13 09:30").ok).toBe(false);
	});
});

describe("プロパティ入力行", () => {
	it("入力された値を最初に置き、その下に現在の値を置きます", () => {
		const rows = propertyInputRows({
			kind: "text",
			query: "hello",
			current: "old",
			vaultValues: ["hello world", "other"],
		});
		expect(rows[0]).toEqual({
			label: '"hello" に設定',
			description: "現在: old",
			icon: "check",
			value: "hello",
		});
		expect(rows.map((row) => row.label)).toEqual(['"hello" に設定', "hello world"]);
	});

	it("無効な入力を設定する代わりに説明します", () => {
		const rows = propertyInputRows({
			kind: "date",
			query: "tomorrow",
			current: undefined,
			vaultValues: [],
		});
		expect(rows).toEqual([
			{
				label: "日付は YYYY-MM-DD の形式で入力してください。",
				description: "現在: 未設定",
				icon: "alert-circle",
			},
		]);
	});

	it("種類に対して有効な場合にのみ Vault 値を提供します", () => {
		const rows = propertyInputRows({
			kind: "number",
			query: "",
			current: 2,
			vaultValues: ["3", "many", "10"],
		});
		expect(rows.slice(1).map((row) => row.value)).toEqual([3, 10]);
	});
});
