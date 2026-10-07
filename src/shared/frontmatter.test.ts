import { describe, expect, it } from "vitest";
import {
	mergeFrontmatterTags,
	normalizeFrontmatterTags,
	removeFrontmatterTags,
} from "src/shared/frontmatter";

describe("normalizeFrontmatterTags", () => {
	it("reads list and string forms", () => {
		expect(normalizeFrontmatterTags(["a", 1])).toEqual(["a", "1"]);
		expect(normalizeFrontmatterTags("a, b c")).toEqual(["a", "b", "c"]);
		expect(normalizeFrontmatterTags(undefined)).toEqual([]);
		expect(normalizeFrontmatterTags({ tag: "a" })).toEqual([]);
	});
});

describe("mergeFrontmatterTags", () => {
	it("adds tags, keeps existing spellings for case-only duplicates, and sorts", () => {
		expect(mergeFrontmatterTags("Project, b", ["project", "a", "#b"])).toEqual([
			"Project",
			"a",
			"b",
		]);
	});
});

describe("removeFrontmatterTags", () => {
	it("removes tags ignoring case and hashes while keeping the original order", () => {
		expect(removeFrontmatterTags(["b", "Project", "a"], ["#project", "x"])).toEqual(["b", "a"]);
		expect(removeFrontmatterTags("a, b", ["a", "b"])).toEqual([]);
	});
});
