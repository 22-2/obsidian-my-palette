import { describe, expect, it } from "vitest";
import { shouldRestore } from "src/palette/restoreState";

const CLOSED_AT = 1_000_000;

describe("shouldRestore", () => {
	it("restores within the allowed time, including exactly at the limit", () => {
		expect(shouldRestore(CLOSED_AT, CLOSED_AT + 30_000, 30)).toBe(true);
		expect(shouldRestore(CLOSED_AT, CLOSED_AT + 30_001, 30)).toBe(false);
	});

	it("never restores when Pop to Root Search is immediate", () => {
		expect(shouldRestore(CLOSED_AT, CLOSED_AT, 0)).toBe(false);
	});
});
