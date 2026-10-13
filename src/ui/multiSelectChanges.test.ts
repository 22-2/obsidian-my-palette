import { describe, expect, it } from "vitest";
import {
	changeCount,
	directChanges,
	isCheckedRow,
	pendingChanges,
	type ChangeRow,
} from "src/ui/multiSelectChanges";

const fresh: ChangeRow<string> = { key: "a", value: "a" };
const applied: ChangeRow<string> = { key: "b", value: "b", applied: true };

describe("isCheckedRow", () => {
	it("starts unapplied rows unchecked and applied rows checked", () => {
		expect(isCheckedRow(fresh, new Set())).toBe(false);
		expect(isCheckedRow(applied, new Set())).toBe(true);
	});

	it("flips a row when it is toggled", () => {
		expect(isCheckedRow(fresh, new Set(["a"]))).toBe(true);
		expect(isCheckedRow(applied, new Set(["b"]))).toBe(false);
	});
});

describe("pendingChanges", () => {
	it("adds checked unapplied rows and removes unchecked applied rows", () => {
		const changes = pendingChanges([fresh, applied], new Set(["a", "b"]));
		expect(changes).toEqual({ add: ["a"], remove: ["b"] });
	});

	it("ignores applied rows that are only highlighted", () => {
		expect(pendingChanges([fresh, applied], new Set())).toEqual({ add: ["a"], remove: [] });
	});
});

describe("directChanges", () => {
	it("splits rows the user acted on into adds and removes", () => {
		expect(directChanges([fresh, applied])).toEqual({ add: ["a"], remove: ["b"] });
		expect(directChanges([applied])).toEqual({ add: [], remove: ["b"] });
	});
});

describe("changeCount", () => {
	it("counts adds and removes together", () => {
		expect(changeCount({ add: ["a", "c"], remove: ["b"] })).toBe(3);
		expect(changeCount({ add: [], remove: [] })).toBe(0);
	});
});
