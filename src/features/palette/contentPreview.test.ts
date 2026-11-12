import { describe, expect, it, vi } from "vitest";
import { contentExcerpt, contentPreviewTerm } from "src/features/palette/contentPreview";

vi.mock("obsidian", () => ({ TFile: class {} }));

describe("本文プレビュー", () => {
	it.each([
		["content:約束", "約束"],
		['content:"hello world"', "hello world"],
		["CONTENT:hello ", "hello"],
	])("単独の検索語 %s を取り出す", (query, expected) => {
		expect(contentPreviewTerm(query)).toBe(expected);
	});
	it.each([
		"content:",
		"!content:abc",
		"regex:content:abc",
		"content:abc ext:md",
		"content:<a b>",
		"content:a*",
	])("複雑な検索 %s は表示しない", (query) => {
		expect(contentPreviewTerm(query)).toBeUndefined();
	});
	it("一致部分と短い前後の文を返す", () => {
		expect(contentExcerpt("始まり\nこれは約束です\nおわり", "約束")).toEqual({
			before: "始まり これは",
			match: "約束",
			after: "です おわり",
		});
		expect(contentExcerpt("ない", "約束")).toBeUndefined();
		expect(contentExcerpt("İ A.b", "a.b")).toEqual({ before: "İ ", match: "A.b", after: "" });
	});
});
