import { describe, expect, it } from "vitest";
import { sortCommandMatches } from "src/search/command/commandSorting";

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
			"toolkit:delete",
			"toolkit:export",
			"reader:external",
			"reader:current",
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

	it("sorts multi-word matches by command name instead of fuzzy character distance", () => {
		const results = sortCommandMatches(
			[
				match("navigate", "@My Commands Plugin: Navigate to outgoing link", 100),
				match("copy", "@My Commands Plugin: Copy file path with outgoing link paths", 10),
			],
			"my commands outgoing",
		);

		expect(results.map(({ id }) => id)).toEqual(["copy", "navigate"]);
	});

	it("sorts equal single-word matches by action name across plugins", () => {
		const results = sortCommandMatches(
			[
				match("open", "GridExplorer: Open outgoing links in grid view", 100),
				match("copy", "@My Commands Plugin: Copy file path with outgoing link paths", 10),
			],
			"outgoing",
		);

		expect(results.map(({ id }) => id)).toEqual(["copy", "open"]);
	});
});
