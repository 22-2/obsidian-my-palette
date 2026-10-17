import { describe, expect, it } from "vitest";
import {
	allQueryTerms,
	parseSearchQuery,
	positiveQueryTerms,
	positiveTermBranches,
} from "src/search/query/searchQuery";

const term = (text: string, exact = false) => ({ kind: "term", text, exact });

describe("parseSearchQuery", () => {
	it("returns undefined for queries without searchable content", () => {
		for (const query of ["", "   ", "|", "!", "<>", '""', "! |"]) {
			expect(parseSearchQuery(query)).toBeUndefined();
		}
	});

	it("binds OR tighter than AND", () => {
		expect(parseSearchQuery("a b|c")).toEqual({
			kind: "and",
			operands: [term("a"), { kind: "or", operands: [term("b"), term("c")] }],
		});
		expect(parseSearchQuery("a b | c")).toEqual(parseSearchQuery("a b|c"));
	});

	it("overrides precedence with angle brackets", () => {
		expect(parseSearchQuery("<a b>|c")).toEqual({
			kind: "or",
			operands: [{ kind: "and", operands: [term("a"), term("b")] }, term("c")],
		});
	});

	it("reads NOT only at the start of a term", () => {
		expect(parseSearchQuery("!a")).toEqual({ kind: "not", operand: term("a") });
		expect(parseSearchQuery("hello!")).toEqual(term("hello!"));
		expect(parseSearchQuery("a!b")).toEqual(term("a!b"));
	});

	it("keeps angle brackets literal inside words", () => {
		expect(parseSearchQuery("a<b")).toEqual(term("a<b"));
		expect(parseSearchQuery("a>b")).toEqual(term("a>b"));
		// `>` closes a group only where a term can end.
		expect(parseSearchQuery("<size:>10 x>")).toEqual({
			kind: "and",
			operands: [term("size:>10"), term("x")],
		});
	});

	it("treats quoted text as one literal term", () => {
		expect(parseSearchQuery('"a b|c"')).toEqual(term("a b|c", true));
		expect(parseSearchQuery('"!important"')).toEqual(term("!important", true));
		expect(parseSearchQuery('foo"bar baz"')).toEqual(term("foobar baz", true));
	});

	it("tolerates half-typed input", () => {
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

describe("query term views", () => {
	it("expands positive terms into AND branches", () => {
		expect(positiveTermBranches("a b|c")).toEqual([
			["a", "b"],
			["a", "c"],
		]);
		expect(positiveTermBranches("<a b>|c")).toEqual([["a", "b"], ["c"]]);
	});

	it("leaves excluded terms out of positive views", () => {
		expect(positiveTermBranches("a !b")).toEqual([["a"]]);
		expect(positiveTermBranches("!b")).toEqual([]);
		expect(positiveQueryTerms("a !<b c> d|e")).toEqual(["a", "d", "a", "e"]);
	});

	it("lists every term, excluded ones included", () => {
		expect(allQueryTerms("a !<b c> d|e")).toEqual(["a", "b", "c", "d", "e"]);
	});
});
