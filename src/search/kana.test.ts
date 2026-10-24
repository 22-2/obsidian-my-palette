import { describe, expect, it } from "vitest";
import { foldKana } from "src/search/kana";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

describe("折りかな", () => {
	it("ひらがなをカタカナに変換し、長さを維持します", () => {
		expect(foldKana("ながの")).toBe("ナガノ");
		expect(foldKana("ながの")).toHaveLength("ながの".length);
	});

	it("カタカナ、漢字、ASCII は変更しないでください。", () => {
		expect(foldKana("ナガノ 長野 abc")).toBe("ナガノ 長野 abc");
	});
});

describe("検索FuzzyQueryとfoldKana", () => {
	const items = ["長野旅行.md", "ナガノ メモ.md", "Nagano.md"];
	const keys = [(item: string) => item];

	it("デフォルトではひらがなとカタカナは一致しません", () => {
		expect(searchFuzzyQuery("ながの", items, keys).map(({ obj }) => obj)).toEqual([]);
	});

	it("折り畳むときにひらがなとカタカナを同じテキストとして一致させます", () => {
		const found = searchFuzzyQuery("ながの", items, keys, { foldKana: true }).map(
			({ obj }) => obj,
		);
		expect(found).toEqual(expect.arrayContaining(["ナガノ メモ.md"]));
	});

	it("カタカナのクエリとひらがなの値を照合します。", () => {
		const found = searchFuzzyQuery("ナガノ", ["ながの旅.md"], keys, { foldKana: true });
		expect(found).toHaveLength(1);
	});
});
