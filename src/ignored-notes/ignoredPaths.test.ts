import { describe, expect, it } from "vitest";
import {
	isUserIgnoreFilterRegex,
	isUserIgnoredPathWithFilters,
} from "src/ignored-notes/ignoredPathMatching";

describe("ignored path filters", () => {
	it("recognizes slash-delimited regular expressions", () => {
		expect(isUserIgnoreFilterRegex("/archive-.*/")).toBe(true);
		expect(isUserIgnoreFilterRegex("archive")).toBe(false);
	});

	it("matches a literal folder and its descendants without matching a sibling", () => {
		expect(isUserIgnoredPathWithFilters(["archive"], "archive/note.md")).toBe(true);
		expect(isUserIgnoredPathWithFilters(["archive"], "archive-old/note.md")).toBe(false);
	});

	it("matches regular-expression filters against normalized paths", () => {
		expect(isUserIgnoredPathWithFilters(["/\\.private\\//"], ".private/note.md")).toBe(true);
		expect(isUserIgnoredPathWithFilters(["/\\.private\\//"], "notes/note.md")).toBe(false);
	});

	it("ignores invalid regular expressions instead of rejecting the search", () => {
		expect(isUserIgnoredPathWithFilters(["/[invalid/", "archive"], "notes/note.md")).toBe(
			false,
		);
		expect(isUserIgnoredPathWithFilters(["/[invalid/", "archive"], "archive/note.md")).toBe(
			true,
		);
	});
});
