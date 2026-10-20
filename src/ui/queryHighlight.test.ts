import { describe, expect, it } from "vitest";
import { matchPreparer } from "src/search/kana";
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

	it("highlights kana matches by position when folding hiragana and katakana", () => {
		const prepare = matchPreparer(true);
		// 変換は文字数を変えないので、位置は元のラベルの文字に一致する。
		expect(matchedQueryIndexes("ナガノ旅行", "ながの", prepare)).toEqual([0, 1, 2]);
		expect(matchedQueryIndexes("ながの旅行", "ナガノ", prepare)).toEqual([0, 1, 2]);
	});

	it("does not highlight kana matches when folding is off", () => {
		expect(matchedQueryIndexes("ナガノ旅行", "ながの")).toEqual([]);
	});
});
