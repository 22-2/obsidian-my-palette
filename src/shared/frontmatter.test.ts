import { describe, expect, it } from "vitest";
import {
	mergeFrontmatterTags,
	normalizeFrontmatterKeywords,
	normalizeFrontmatterTags,
	removeFrontmatterTags,
} from "src/shared/frontmatter";

describe("正規化Frontmatterキーワード", () => {
	it("文字列配列のみを受け入れ、空または無効な要素をスキップします", () => {
		expect(
			normalizeFrontmatterKeywords([" 日本語 ", "two words", "", " ", 42, null, "日本語"]),
		).toEqual(["日本語", "two words"]);
		expect(normalizeFrontmatterKeywords(undefined)).toEqual([]);
		expect(normalizeFrontmatterKeywords("keyword")).toEqual([]);
	});
});

describe("フロントマタータグを削除", () => {
	it("大文字と小文字やハッシュに関係なく、順序を維持しながらタグを削除します", () => {
		expect(removeFrontmatterTags(["z", "#Project", "a"], ["project"])).toEqual(["z", "a"]);
		expect(removeFrontmatterTags("only", ["#only"])).toEqual([]);
	});
});

describe("正規化Frontmatterタグ", () => {
	it("リストと文字列形式を読み取ります", () => {
		expect(normalizeFrontmatterTags(["a", 1])).toEqual(["a", "1"]);
		expect(normalizeFrontmatterTags("a, b c")).toEqual(["a", "b", "c"]);
		expect(normalizeFrontmatterTags(undefined)).toEqual([]);
		expect(normalizeFrontmatterTags({ tag: "a" })).toEqual([]);
	});
});

describe("Frontmatterタグをマージする", () => {
	it("タグを追加し、大文字と小文字のみが重複する場合は既存のスペルを保持し、並べ替えます。", () => {
		expect(mergeFrontmatterTags("Project, b", ["project", "a", "#b"])).toEqual([
			"Project",
			"a",
			"b",
		]);
	});
});
