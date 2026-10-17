import { describe, expect, it } from "vitest";
import { checkPropertyInput, propertyInputRows } from "src/properties/propertyInput";

describe("checkPropertyInput", () => {
	it("accepts any text, and empty input for every kind", () => {
		expect(checkPropertyInput("text", "  hi ")).toEqual({ ok: true, value: "  hi " });
		expect(checkPropertyInput("number", "  ")).toEqual({ ok: true, value: "" });
		expect(checkPropertyInput("date", "")).toEqual({ ok: true, value: "" });
	});

	it("writes a number as a number", () => {
		expect(checkPropertyInput("number", " 4.5 ")).toEqual({ ok: true, value: 4.5 });
		expect(checkPropertyInput("number", "abc")).toEqual({
			ok: false,
			reason: "数値を入力してください。",
		});
	});

	it("checks dates against the calendar", () => {
		expect(checkPropertyInput("date", "2026-10-13")).toEqual({ ok: true, value: "2026-10-13" });
		expect(checkPropertyInput("date", "2026-02-30").ok).toBe(false);
		expect(checkPropertyInput("date", "2026/10/13").ok).toBe(false);
	});

	it("accepts date and time with optional seconds only in range", () => {
		expect(checkPropertyInput("datetime", "2026-10-13T09:30").ok).toBe(true);
		expect(checkPropertyInput("datetime", "2026-10-13T09:30:15").ok).toBe(true);
		expect(checkPropertyInput("datetime", "2026-10-13T24:00").ok).toBe(false);
		expect(checkPropertyInput("datetime", "2026-10-13 09:30").ok).toBe(false);
	});
});

describe("propertyInputRows", () => {
	it("puts the typed value first, with the current value under it", () => {
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

	it("explains an invalid input instead of offering to set it", () => {
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

	it("offers vault values only when they are valid for the kind", () => {
		const rows = propertyInputRows({
			kind: "number",
			query: "",
			current: 2,
			vaultValues: ["3", "many", "10"],
		});
		expect(rows.slice(1).map((row) => row.value)).toEqual([3, 10]);
	});
});
