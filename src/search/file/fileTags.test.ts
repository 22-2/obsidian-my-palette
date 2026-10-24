import { describe, expect, it } from "vitest";
import { isTagOnlyQuery, matchingTags, normalizeTags } from "src/search/file/fileTags";

describe("ファイルタグ", () => {
	it("フロントマターとインラインタグの値を正規化します", () => {
		expect(normalizeTags(["#project", "writing", ["#project", "", 42], " #todo "])).toEqual([
			"#project",
			"#writing",
			"#todo",
		]);
	});

	it("ハッシュ接頭辞が付いたタグのみのクエリを認識します", () => {
		expect(isTagOnlyQuery("#project #todo | #archive")).toBe(true);
		expect(isTagOnlyQuery("project #todo")).toBe(false);
		expect(isTagOnlyQuery("#")).toBe(true);
		expect(isTagOnlyQuery("#project !#done")).toBe(true);
		// Excluding a name or folder needs every field, not only tags.
		expect(isTagOnlyQuery("#project !archive")).toBe(false);
		expect(isTagOnlyQuery("!#done")).toBe(false);
	});

	it("ファイル検索で使用されるのと同じあいまい一致を持つタグを検索します", () => {
		expect(matchingTags(["#project", "#writing", "#todo"], "#proj")).toEqual(["#project"]);
		expect(matchingTags(["#project", "#writing", "#todo"], "writing | todo")).toEqual([
			"#writing",
			"#todo",
		]);
		expect(matchingTags(["#project", "#writing"], "#")).toEqual(["#project", "#writing"]);
		expect(matchingTags(["#project", "#done"], "#project !#done")).toEqual(["#project"]);
	});
});
