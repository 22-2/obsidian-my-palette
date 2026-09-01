import { describe, expect, it } from "vitest";
import { matchedQueryIndexes } from "src/ui/queryHighlight";

describe("query highlighting", () => {
	it("highlights every matching term in an AND query", () => {
		expect(matchedQueryIndexes("alpha beta", "alpha beta")).toEqual([
			0, 1, 2, 3, 4, 6, 7, 8, 9,
		]);
	});

	it("highlights the matching branch in an OR query", () => {
		expect(matchedQueryIndexes("alpha beta", "gamma | beta")).toEqual([6, 7, 8, 9]);
	});

	it("prefers the branch that explains more AND terms", () => {
		expect(matchedQueryIndexes("alpha beta", "alpha beta | beta")).toEqual([
			0, 1, 2, 3, 4, 6, 7, 8, 9,
		]);
	});
});
