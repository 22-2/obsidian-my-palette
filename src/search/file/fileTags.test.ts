import { describe, expect, it } from "vitest";
import { isTagOnlyQuery, matchingTags, normalizeTags } from "src/search/file/fileTags";

describe("file tags", () => {
	it("normalizes frontmatter and inline tag values", () => {
		expect(normalizeTags(["#project", "writing", ["#project", "", 42], " #todo "])).toEqual([
			"#project",
			"#writing",
			"#todo",
		]);
	});

	it("recognizes hash-prefixed tag-only queries", () => {
		expect(isTagOnlyQuery("#project #todo | #archive")).toBe(true);
		expect(isTagOnlyQuery("project #todo")).toBe(false);
		expect(isTagOnlyQuery("#")).toBe(true);
	});

	it("finds tags with the same fuzzy matching used by file search", () => {
		expect(matchingTags(["#project", "#writing", "#todo"], "#proj")).toEqual(["#project"]);
		expect(matchingTags(["#project", "#writing", "#todo"], "writing | todo")).toEqual([
			"#writing",
			"#todo",
		]);
		expect(matchingTags(["#project", "#writing"], "#")).toEqual(["#project", "#writing"]);
	});
});
