import { describe, expect, it } from "vitest";
import {
	fuzzyMatchCoverage,
	hasContiguousQueryMatch,
	searchFuzzyQuery,
	searchFuzzyQueryWithFieldScores,
} from "src/search/fuzzyQuery";

const items = ["alpha beta", "alpha gamma", "delta beta", "omega"];

describe("検索ファジークエリ", () => {
	it("AND 分岐と OR 分岐にわたる完全な連続一致を検出します", () => {
		expect(hasContiguousQueryMatch("alpha beta", ["alpha", "beta"])).toBe(true);
		expect(hasContiguousQueryMatch("<alpha beta> | gamma", ["gamma"])).toBe(true);
		expect(hasContiguousQueryMatch("<alpha beta> | gamma", ["alpha", "delta"])).toBe(false);
		expect(hasContiguousQueryMatch("alpha !delta", ["alpha", "delta"])).toBe(true);
	});

	it("個別の検索可能な値全体で一致した文字をカウントします", () => {
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

	it("カバレッジが最も高い有効な OR 分岐を使用します", () => {
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

	it("空白で区切られた用語を AND として扱います", () => {
		expect(
			searchFuzzyQuery("alpha beta", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta"]);
	});

	it("パイプで区切られた分岐を OR として扱います", () => {
		const results = searchFuzzyQuery("gamma | delta", items, [(item) => item]).map(
			({ obj }) => obj,
		);
		expect(results).toHaveLength(2);
		expect(results).toEqual(expect.arrayContaining(["alpha gamma", "delta beta"]));
	});

	it("Everything と同様に、OR を AND よりも強くバインドします", () => {
		const results = searchFuzzyQuery("alpha beta|gamma", items, [(item) => item]).map(
			({ obj }) => obj,
		);
		expect(results).toHaveLength(2);
		expect(results).toEqual(expect.arrayContaining(["alpha beta", "alpha gamma"]));
	});

	it("山括弧で用語をグループ化する", () => {
		expect(
			searchFuzzyQuery("<alpha beta> | omega", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta", "omega"]);
	});

	it("否定語を含む項目を除外します", () => {
		expect(
			searchFuzzyQuery("alpha !gamma", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha beta"]);
	});

	it("あいまい一致ではなく包含によって除外します", () => {
		// A fuzzy `!aa` would reject "alpha beta" for its scattered a's.
		expect(searchFuzzyQuery("!aa", items, [(item) => item]).map(({ obj }) => obj)).toEqual(
			items,
		);
	});

	it("除外のみを使用してクエリの入力順序を維持します", () => {
		expect(searchFuzzyQuery("!beta", items, [(item) => item]).map(({ obj }) => obj)).toEqual([
			"alpha gamma",
			"omega",
		]);
	});

	it("グループ全体を否定する", () => {
		expect(
			searchFuzzyQuery("!<alpha beta>", items, [(item) => item]).map(({ obj }) => obj),
		).toEqual(["alpha gamma", "delta beta", "omega"]);
	});

	it("引用されたテキストが連続して一致する", () => {
		expect(searchFuzzyQuery('"ha be"', items, [(item) => item]).map(({ obj }) => obj)).toEqual([
			"alpha beta",
		]);
		expect(searchFuzzyQuery('"abt"', items, [(item) => item])).toEqual([]);
	});

	it("リストを空にする代わりに、途中で入力された演算子を無視します。", () => {
		for (const query of ["!", "alpha |", "alpha !", "<alpha", '"']) {
			expect(searchFuzzyQuery(query, items, [(item) => item]).length).toBeGreaterThan(0);
		}
	});

	it("用語をさまざまな検索可能なフィールドに一致させることができます", () => {
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

	it("一致したフィールドのあいまいなスコアを保持します", () => {
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
