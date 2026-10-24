import { describe, expect, it } from "vitest";
import { matchPreparer } from "src/search/kana";
import { matchedQueryIndexes } from "src/ui/queryHighlight";

describe("クエリの強調表示", () => {
	it("AND クエリ内の一致するすべての用語を強調表示します。", () => {
		expect(matchedQueryIndexes("alpha beta", "alpha beta")).toEqual([
			0, 1, 2, 3, 4, 6, 7, 8, 9,
		]);
	});

	it("OR クエリ内の一致するブランチを強調表示します。", () => {
		expect(matchedQueryIndexes("alpha beta", "gamma | beta")).toEqual([6, 7, 8, 9]);
	});

	it("より多くの AND 用語を説明するブランチを好みます", () => {
		expect(matchedQueryIndexes("alpha beta", "alpha beta | beta")).toEqual([
			0, 1, 2, 3, 4, 6, 7, 8, 9,
		]);
	});

	it("ひらがなとカタカナを折りたたむときに、かなの一致を位置によって強調表示します。", () => {
		const prepare = matchPreparer(true);
		// 変換は文字数を変えないので、位置は元のラベルの文字に一致する。
		expect(matchedQueryIndexes("ナガノ旅行", "ながの", prepare)).toEqual([0, 1, 2]);
		expect(matchedQueryIndexes("ながの旅行", "ナガノ", prepare)).toEqual([0, 1, 2]);
	});

	it("折りたたみがオフの場合、かなの一致は強調表示されません", () => {
		expect(matchedQueryIndexes("ナガノ旅行", "ながの")).toEqual([]);
	});
});
