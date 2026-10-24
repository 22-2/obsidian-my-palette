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

describe("ファイル一致シグナルの構造", () => {
	it("AND / OR 用語全体でキーワードを照合し、ランキングの証拠に含めます。", () => {
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

	it("タグのみのクエリの証拠としてキーワードを提示しません", () => {
		const note = entry({ tags: ["#宇宙"], keywords: ["#宇宙"] });
		const [candidate] = searchFuzzyQueryWithFieldScores("#宇宙", [note], fileSearchKeys(true));
		expect(candidate).toBeDefined();
		if (!candidate) return;
		expect(
			createFileMatch(candidate, "#宇宙", { tagOnlyQuery: true, usesMatchCoverage: true }),
		).toMatchObject({ matchedKeywords: [], matchedTags: ["#宇宙"], matchCoverage: 3 });
	});

	it("共有検索キーを名前付きフィールド信号にマッピングし直す", () => {
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

	it("フィールドスコアと派生クエリ信号を一緒に保持します", () => {
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

	it("ファイル名のみの一致をフォルダー パス信号から除外します", () => {
		const [candidate] = searchFuzzyQueryWithFieldScores(
			"project-plan",
			[entry()],
			fileSearchKeys(false),
		);
		expect(candidate).toBeDefined();
		if (!candidate) return;

		expect(candidate.fieldScores[1]).toBeUndefined();
	});

	it("タグのみのクエリをファイル名、パス、エイリアス信号から除外します", () => {
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
