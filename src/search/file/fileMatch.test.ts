import { describe, expect, it } from "vitest";
import { createFileMatch, type FileSearchEntry } from "src/search/file/fileMatch";

function entry(overrides: Partial<FileSearchEntry> = {}): FileSearchEntry {
	return {
		path: "notes/project-plan.md",
		basename: "project-plan",
		aliases: ["Project roadmap"],
		tags: ["#project", "#work"],
		extension: "md",
		text: "project-plan notes/project-plan.md Project roadmap",
		mtime: 1,
		ignored: false,
		...overrides,
	};
}

describe("file match signal construction", () => {
	it("keeps field scores and derived query signals together", () => {
		const match = createFileMatch(
			{
				obj: entry(),
				score: -1,
				fieldScores: [-2, -3, -4, -5, -6],
			},
			"project",
			{ tagOnlyQuery: false, usesMatchCoverage: true },
		);

		expect(match).toMatchObject({
			score: -1,
			filenameScore: -2,
			pathScore: -3,
			aliasScore: -5,
			tagMatchCount: 1,
			contiguousMatch: true,
			matchedTags: ["#project"],
		});
		expect(match.matchCoverage).toBeGreaterThan(0);
	});

	it("keeps tag-only queries out of filename, path, and alias signals", () => {
		const match = createFileMatch(
			{
				obj: entry({ basename: "unrelated" }),
				score: -1,
				fieldScores: [-2, -3, -4, -5, -6],
			},
			"#project",
			{ tagOnlyQuery: true, usesMatchCoverage: true },
		);

		expect(match).toMatchObject({
			filenameScore: undefined,
			pathScore: undefined,
			aliasScore: undefined,
			tagMatchCount: 1,
			contiguousMatch: true,
			matchedTags: ["#project"],
		});
		expect(match.matchCoverage).toBeGreaterThan(0);
	});
});
