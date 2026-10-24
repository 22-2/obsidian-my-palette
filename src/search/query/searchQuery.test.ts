import { describe, expect, it } from "vitest";
import {
	allQueryTerms,
	parseSearchQuery,
	positiveQueryTerms,
	positiveTermBranches,
} from "src/search/query/searchQuery";

const term = (text: string, exact = false) => ({ kind: "term", text, exact });

describe("検索クエリの解析", () => {
	it("検索可能なコンテンツのないクエリの場合は unknown を返します", () => {
		for (const query of ["", "   ", "|", "!", "<>", '""', "! |"]) {
			expect(parseSearchQuery(query)).toBeUndefined();
		}
	});

	it("OR を AND よりも強く結合します", () => {
		expect(parseSearchQuery("a b|c")).toEqual({
			kind: "and",
			operands: [term("a"), { kind: "or", operands: [term("b"), term("c")] }],
		});
		expect(parseSearchQuery("a b | c")).toEqual(parseSearchQuery("a b|c"));
	});

	it("山かっこで優先順位をオーバーライドします", () => {
		expect(parseSearchQuery("<a b>|c")).toEqual({
			kind: "or",
			operands: [{ kind: "and", operands: [term("a"), term("b")] }, term("c")],
		});
	});

	it("学期の初めだけではありません", () => {
		expect(parseSearchQuery("!a")).toEqual({ kind: "not", operand: term("a") });
		expect(parseSearchQuery("hello!")).toEqual(term("hello!"));
		expect(parseSearchQuery("a!b")).toEqual(term("a!b"));
	});

	it("単語内の山かっこをリテラルに保ちます", () => {
		expect(parseSearchQuery("a<b")).toEqual(term("a<b"));
		expect(parseSearchQuery("a>b")).toEqual(term("a>b"));
		// `>` closes a group only where a term can end.
		expect(parseSearchQuery("<size:>10 x>")).toEqual({
			kind: "and",
			operands: [term("size:>10"), term("x")],
		});
	});

	it("引用されたテキストを 1 つの文字通りの用語として扱います", () => {
		expect(parseSearchQuery('"a b|c"')).toEqual(term("a b|c", true));
		expect(parseSearchQuery('"!important"')).toEqual(term("!important", true));
		expect(parseSearchQuery('foo"bar baz"')).toEqual(term("foobar baz", true));
	});

	it("半角入力を許容します", () => {
		expect(parseSearchQuery("a |")).toEqual(term("a"));
		expect(parseSearchQuery("| a")).toEqual(term("a"));
		expect(parseSearchQuery("a !")).toEqual(term("a"));
		expect(parseSearchQuery("<a b")).toEqual({
			kind: "and",
			operands: [term("a"), term("b")],
		});
		expect(parseSearchQuery('"a b')).toEqual(term("a b", true));
		expect(parseSearchQuery("a >")).toEqual({
			kind: "and",
			operands: [term("a"), term(">")],
		});
	});
});

describe("クエリ用語ビュー", () => {
	it("正の項を AND 分岐に展開します", () => {
		expect(positiveTermBranches("a b|c")).toEqual([
			["a", "b"],
			["a", "c"],
		]);
		expect(positiveTermBranches("<a b>|c")).toEqual([["a", "b"], ["c"]]);
	});

	it("ポジティブな意見から除外された用語を残す", () => {
		expect(positiveTermBranches("a !b")).toEqual([["a"]]);
		expect(positiveTermBranches("!b")).toEqual([]);
		expect(positiveQueryTerms("a !<b c> d|e")).toEqual(["a", "d", "a", "e"]);
	});

	it("除外された用語も含めたすべての用語をリストします", () => {
		expect(allQueryTerms("a !<b c> d|e")).toEqual(["a", "b", "c", "d", "e"]);
	});
});
