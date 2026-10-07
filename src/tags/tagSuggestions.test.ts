import { describe, expect, it } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { buildTagSuggestions, tagSuggestionKey } from "src/tags/tagSuggestions";

const choices: TagChoice[] = [
	{ tag: "project", count: 3, registered: false, reason: "recent" },
	{ tag: "projection", count: 9, registered: false },
	{ tag: "proj", count: 1, registered: true },
	{ tag: "writing", count: 5, registered: false },
];

const keys = (query: string, selected: string[] = []) =>
	buildTagSuggestions(choices, query, selected).map(tagSuggestionKey);

describe("buildTagSuggestions", () => {
	it("shows every choice in the given order without a query", () => {
		expect(keys("")).toEqual(["tag:project", "tag:projection", "tag:proj", "tag:writing"]);
	});

	it("filters fuzzily, keeps registered tags last, and accepts a leading hash", () => {
		expect(keys("#proj")).toEqual(["tag:project", "tag:projection", "tag:proj"]);
	});

	it("offers a new tag only when the input is a valid unknown tag", () => {
		expect(keys("proje")[0]).toBe("new:proje");
		expect(keys("Project")).not.toContain("new:Project");
		expect(keys("two words")).not.toContain("new:two words");
		expect(keys("a#b")).not.toContain("new:a#b");
	});

	it("places the confirm row first without a query and last while searching", () => {
		expect(keys("", ["writing"])[0]).toBe("confirm");
		expect(keys("writ", ["writing"]).at(-1)).toBe("confirm");
		expect(buildTagSuggestions(choices, "", ["writing", "new"])[0]).toEqual({
			type: "confirm",
			tags: ["writing", "new"],
		});
	});
});
