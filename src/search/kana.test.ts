import { describe, expect, it } from "vitest";
import { foldKana } from "src/search/kana";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

describe("foldKana", () => {
	it("turns hiragana into katakana and keeps the length", () => {
		expect(foldKana("ながの")).toBe("ナガノ");
		expect(foldKana("ながの")).toHaveLength("ながの".length);
	});

	it("leaves katakana, kanji, and ASCII unchanged", () => {
		expect(foldKana("ナガノ 長野 abc")).toBe("ナガノ 長野 abc");
	});
});

describe("searchFuzzyQuery with foldKana", () => {
	const items = ["長野旅行.md", "ナガノ メモ.md", "Nagano.md"];
	const keys = [(item: string) => item];

	it("does not match across hiragana and katakana by default", () => {
		expect(searchFuzzyQuery("ながの", items, keys).map(({ obj }) => obj)).toEqual([]);
	});

	it("matches hiragana and katakana as the same text when folding", () => {
		const found = searchFuzzyQuery("ながの", items, keys, { foldKana: true }).map(
			({ obj }) => obj,
		);
		expect(found).toEqual(expect.arrayContaining(["ナガノ メモ.md"]));
	});

	it("matches the query in katakana against hiragana values", () => {
		const found = searchFuzzyQuery("ナガノ", ["ながの旅.md"], keys, { foldKana: true });
		expect(found).toHaveLength(1);
	});
});
