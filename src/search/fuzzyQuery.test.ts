import { describe, expect, it } from "vitest";
import { searchFuzzyQuery } from "src/search/fuzzyQuery";

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
});
