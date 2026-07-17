import { describe, expect, it } from "vitest";
import { sortCommandMatches } from "./commandSorting";

function match(id: string, name: string, fuzzyScore = 0) {
	return { command: { id, name }, fuzzyScore };
}

describe("sortCommandMatches", () => {
	it("groups plugin-name matches and sorts commands predictably", () => {
		const results = sortCommandMatches(
			[
				match("toolkit:export", "@Novel Toolkit: Export novel data", 100),
				match("other:format", "@My Commands Plugin: Format novel text", 500),
				match("toolkit:delete", "@Novel Toolkit: Delete all remote novels", 300),
				match("reader:external", "Novel Reader: Open External File", 50),
				match("reader:current", "Novel Reader: Open Novel Reader", 25),
			],
			"novel",
		);

		expect(results.map(({ id }) => id)).toEqual([
			"reader:external",
			"reader:current",
			"toolkit:delete",
			"toolkit:export",
			"other:format",
		]);
	});

	it("uses fuzzy relevance when there is no direct text match", () => {
		const results = sortCommandMatches(
			[
				match("lower", "Tools: Export document", 10),
				match("higher", "Notes: Explore document", 20),
			],
			"exdoc",
		);

		expect(results.map(({ id }) => id)).toEqual(["higher", "lower"]);
	});
});
