import { describe, expect, it } from "vitest";
import { shouldRestore } from "src/palette/restoreState";

const CLOSED_AT = 1_000_000;

describe("復元する必要があります", () => {
	it("制限時間内を含め、許容時間内に復元します", () => {
		expect(shouldRestore(CLOSED_AT, CLOSED_AT + 30_000, 30)).toBe(true);
		expect(shouldRestore(CLOSED_AT, CLOSED_AT + 30_001, 30)).toBe(false);
	});

	it("Return to Home after が即時に実行されると復元されない", () => {
		expect(shouldRestore(CLOSED_AT, CLOSED_AT, 0)).toBe(false);
	});
});
