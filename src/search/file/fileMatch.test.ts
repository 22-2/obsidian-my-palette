import { describe, expect, it } from "vitest";
import { createFileMatch, fileSearchKeys, type FileSearchEntry } from "src/search/file/fileMatch";
import { searchFuzzyQueryWithFieldScores } from "src/search/fuzzyQuery";

function entry(overrides: Partial<FileSearchEntry> = {}): FileSearchEntry {
	return {
		path: "notes/project-plan.md",
		basename: "project-plan",
		aliases: ["Project roadmap"],
		keywords: [],
		tags: ["#project", "#work"],
		extension: "md",
		text: "project-plan notes/project-plan.md Project roadmap",
		mtime: 1,
		ignored: false,
		...overrides,
	};
}

describe("file match signal construction", () => {
	it("matches keywords across AND / OR terms and includes them in ranking evidence", () => {
		const note = entry({ keywords: ["宇宙", "星空観察", "unrelated"] });
		const [candidate] = searchFuzzyQueryWithFieldScores(
			"宇宙 星空 | missing",
			[note],
			fileSearchKeys(false),
		);
		expect(candidate).toBeDefined();
		if (!candidate) return;
		const match = createFileMatch(candidate, "宇宙 星空 | missing", {
			tagOnlyQuery: false,
			usesMatchCoverage: true,
		});
		expect(match).toMatchObject({
			matchedKeywords: ["宇宙", "星空観察"],
			contiguousMatch: true,
			matchCoverage: 4,
		});
		expect(match.filenameScore).toBeUndefined();
		expect(match.aliasScore).toBeUndefined();
		expect(searchFuzzyQueryWithFieldScores("#宇宙", [note], fileSearchKeys(true))).toHaveLength(
			0,
		);
	});

	it("does not present keywords as evidence for tag-only queries", () => {
		const note = entry({ tags: ["#宇宙"], keywords: ["#宇宙"] });
		const [candidate] = searchFuzzyQueryWithFieldScores("#宇宙", [note], fileSearchKeys(true));
		expect(candidate).toBeDefined();
		if (!candidate) return;
		expect(
			createFileMatch(candidate, "#宇宙", { tagOnlyQuery: true, usesMatchCoverage: true }),
		).toMatchObject({ matchedKeywords: [], matchedTags: ["#宇宙"], matchCoverage: 3 });
	});

	it("maps shared search keys back to their named field signals", () => {
		const [candidate] = searchFuzzyQueryWithFieldScores(
			"roadmap",
			[entry()],
			fileSearchKeys(false),
		);
		expect(candidate).toBeDefined();
		if (!candidate) return;

		const match = createFileMatch(candidate, "roadmap", {
			tagOnlyQuery: false,
			usesMatchCoverage: false,
		});

		expect(match.filenameScore).toBeUndefined();
		expect(match.folderPathScore).toBeUndefined();
		expect(match.aliasScore).toEqual(expect.any(Number));
		expect(match.matchCoverage).toBeUndefined();
	});

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
			folderPathScore: -3,
			aliasScore: -5,
			tagMatchCount: 1,
			contiguousMatch: true,
			matchedTags: ["#project"],
		});
		expect(match.matchCoverage).toBeGreaterThan(0);
	});

	it("keeps filename-only matches out of the folder path signal", () => {
		const [candidate] = searchFuzzyQueryWithFieldScores(
			"project-plan",
			[entry()],
			fileSearchKeys(false),
		);
		expect(candidate).toBeDefined();
		if (!candidate) return;

		expect(candidate.fieldScores[1]).toBeUndefined();
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
			folderPathScore: undefined,
			aliasScore: undefined,
			tagMatchCount: 1,
			contiguousMatch: true,
			matchedTags: ["#project"],
		});
		expect(match.matchCoverage).toBeGreaterThan(0);
	});
});
