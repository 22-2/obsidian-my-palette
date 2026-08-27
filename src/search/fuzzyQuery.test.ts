import { describe, expect, it } from "vitest";
import { searchFuzzyQuery, searchFuzzyQueryWithFieldScores } from "src/search/fuzzyQuery";

const items = ["alpha beta", "alpha gamma", "delta beta", "omega"];

describe("searchFuzzyQuery", () => {
	it("treats whitespace-separated terms as AND", () => {
		expect(
			searchFuzzyQuery("alpha beta", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta"]);
	});

	it("treats pipe-separated branches as OR", () => {
		const results = searchFuzzyQuery("gamma | delta", items, [(item) => item]).map(
			({ obj }) => obj,
		);
		expect(results).toHaveLength(2);
		expect(results).toEqual(expect.arrayContaining(["alpha gamma", "delta beta"]));
	});

	it("combines AND terms within each OR branch", () => {
		expect(
			searchFuzzyQuery("alpha beta | omega", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta", "omega"]);
	});

	it("allows terms to match different searchable fields", () => {
		const records = [
			{ title: "alpha", path: "folder/beta.md" },
			{ title: "alpha", path: "other.md" },
		];
		expect(
			searchFuzzyQuery("alpha beta", records, [
				(item) => item.title,
				(item) => item.path,
			]).map(({ obj }) => obj.path),
		).toEqual(["folder/beta.md"]);
	});

	it("retains fuzzy scores for the fields that matched", () => {
		const records = [
			{ name: "project note", alias: "old note" },
			{ name: "ordinary note", alias: "project" },
		];
		const results = searchFuzzyQueryWithFieldScores("project", records, [
			(record) => record.name,
			(record) => record.alias,
		]);

		const byName = results.find(({ obj }) => obj.name === "project note");
		const byAlias = results.find(({ obj }) => obj.name === "ordinary note");
		expect(byName?.fieldScores[0]).toEqual(expect.any(Number));
		expect(byName?.fieldScores[1]).toBeUndefined();
		expect(byAlias?.fieldScores[0]).toBeUndefined();
		expect(byAlias?.fieldScores[1]).toEqual(expect.any(Number));
	});
});
