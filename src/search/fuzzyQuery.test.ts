import { describe, expect, it } from "vitest";
import {
	fuzzyMatchCoverage,
	hasContiguousQueryMatch,
	searchFuzzyQuery,
	searchFuzzyQueryWithFieldScores,
} from "src/search/fuzzyQuery";

const items = ["alpha beta", "alpha gamma", "delta beta", "omega"];

describe("searchFuzzyQuery", () => {
	it("detects complete contiguous matches across AND and OR branches", () => {
		expect(hasContiguousQueryMatch("alpha beta", ["alpha", "beta"])).toBe(true);
		expect(hasContiguousQueryMatch("<alpha beta> | gamma", ["gamma"])).toBe(true);
		expect(hasContiguousQueryMatch("<alpha beta> | gamma", ["alpha", "delta"])).toBe(false);
		expect(hasContiguousQueryMatch("alpha !delta", ["alpha", "delta"])).toBe(true);
	});

	it("counts matched characters across distinct searchable values", () => {
		expect(
			fuzzyMatchCoverage("project", [
				"project note",
				"archive/project.md",
				"Project",
				"PROJECT",
				"#project",
			]),
		).toBe(28);
	});

	it("uses the highest-coverage valid OR branch", () => {
		expect(
			fuzzyMatchCoverage("<project notes> | plan", [
				"project",
				"notes",
				"plan",
				"plan overview",
				"plan archive",
				"plan alias",
			]),
		).toBe(16);
	});

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

	it("binds OR tighter than AND, as Everything does", () => {
		const results = searchFuzzyQuery("alpha beta|gamma", items, [(item) => item]).map(
			({ obj }) => obj,
		);
		expect(results).toHaveLength(2);
		expect(results).toEqual(expect.arrayContaining(["alpha beta", "alpha gamma"]));
	});

	it("groups terms with angle brackets", () => {
		expect(
			searchFuzzyQuery("<alpha beta> | omega", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta", "omega"]);
	});

	it("excludes items containing a negated term", () => {
		expect(
			searchFuzzyQuery("alpha !gamma", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta"]);
	});

	it("excludes by containment rather than fuzzy matching", () => {
		// A fuzzy `!aa` would reject "alpha beta" for its scattered a's.
		expect(searchFuzzyQuery("!aa", items, [(item) => item]).map(({ obj }) => obj)).toEqual(
			items,
		);
	});

	it("keeps the input order for a query with only exclusions", () => {
		expect(searchFuzzyQuery("!beta", items, [(item) => item]).map(({ obj }) => obj)).toEqual([
			"alpha gamma",
			"omega",
		]);
	});

	it("negates a group as a whole", () => {
		expect(
			searchFuzzyQuery("!<alpha beta>", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha gamma", "delta beta", "omega"]);
	});

	it("matches quoted text contiguously", () => {
		expect(searchFuzzyQuery('"ha be"', items, [(item) => item]).map(({ obj }) => obj)).toEqual([
			"alpha beta",
		]);
		expect(searchFuzzyQuery('"abt"', items, [(item) => item])).toEqual([]);
	});

	it("ignores half-typed operators instead of emptying the list", () => {
		for (const query of ["!", "alpha |", "alpha !", "<alpha", '"']) {
			expect(searchFuzzyQuery(query, items, [(item) => item]).length).toBeGreaterThan(0);
		}
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
