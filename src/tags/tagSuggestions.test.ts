import { describe, expect, it } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { buildTagSuggestions, tagSuggestionKey } from "src/tags/tagSuggestions";

const choices: TagChoice[] = [
	{ tag: "project", count: 3, registered: false, reason: "recent" },
	{ tag: "projection", count: 9, registered: false },
	{ tag: "proj", count: 1, registered: true },
	{ tag: "writing", count: 5, registered: false },
];

const keys = (query: string, checked: string[] = []) =>
	buildTagSuggestions(choices, query, checked).map(tagSuggestionKey);

describe("buildTag提案", () => {
	it("クエリなしですべての選択肢を指定された順序で表示します", () => {
		expect(keys("")).toEqual(["tag:project", "tag:projection", "tag:proj", "tag:writing"]);
	});

	it("あいまいにフィルタリングし、登録されたタグを最後に保持し、先頭のハッシュを受け入れます", () => {
		expect(keys("#proj")).toEqual(["tag:project", "tag:projection", "tag:proj"]);
	});

	it("入力が有効な未知のタグである場合にのみ新しいタグを提供します", () => {
		expect(keys("proje")[0]).toBe("new:proje");
		expect(keys("Project")).not.toContain("new:Project");
		expect(keys("two words")).not.toContain("new:two words");
		expect(keys("a#b")).not.toContain("new:a#b");
	});

	it("入力と一致する間、新しいタグのリストをチェックし続けます", () => {
		expect(keys("", ["writing", "Fresh"])).toEqual([
			"new:Fresh",
			"tag:project",
			"tag:projection",
			"tag:proj",
			"tag:writing",
		]);
		expect(keys("fre", ["Fresh"])).toEqual(["new:fre", "new:Fresh"]);
		// The typed text is the checked tag itself, so it is not offered twice.
		expect(keys("fresh", ["Fresh"])).toEqual(["new:Fresh"]);
		expect(keys("writ", ["Fresh"])).not.toContain("new:Fresh");
	});
});
