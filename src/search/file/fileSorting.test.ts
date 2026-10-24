import { describe, expect, it } from "vitest";
import {
	extractFileMatchSignals,
	sortFileMatches,
	sortFilesWithoutQuery,
	type SortableFileEntry,
} from "src/search/file/fileSorting";
import type { FileSortPriority } from "src/settings/model";

function file(
	path: string,
	mtime: number,
	aliases: string[] = [],
	ignored = false,
	prior?: number,
): SortableFileEntry {
	return {
		path,
		basename:
			path
				.split("/")
				.at(-1)
				?.replace(/\.[^.]+$/, "") ?? path,
		aliases,
		mtime,
		prior,
		ignored,
	};
}

describe("ファイルの並べ替え", () => {
	it("フォルダーの降格により、以前とは関係なくカスタム基準をオーバーライドできます。", () => {
		const entries = [
			file("archive/nested/project.md", 100, [], false, 100),
			file("archive-other/project.md", 1, [], false, 1),
		];
		const folders = ["archive"];
		expect(
			sortFilesWithoutQuery(
				entries.slice(),
				new Map(),
				["Lower prior folders", "Last modified"],
				undefined,
				folders,
			).map(({ path }) => path),
		).toEqual(["archive-other/project.md", "archive/nested/project.md"]);
		expect(
			sortFilesWithoutQuery(
				entries.slice(),
				new Map(),
				["Last modified", "Lower prior folders"],
				undefined,
				folders,
			).map(({ path }) => path),
		).toEqual(["archive/nested/project.md", "archive-other/project.md"]);
		// Disabling the independent criterion must restore the original numeric prior order.
		expect(
			sortFilesWithoutQuery(
				entries.slice(),
				new Map(),
				["@prior:desc"],
				undefined,
				folders,
			).map(({ path }) => path),
		).toEqual(["archive/nested/project.md", "archive-other/project.md"]);
		expect(
			sortFileMatches(
				entries.map((obj, index) => ({ obj, score: -index })),
				"project",
				new Map(),
				["Lower prior folders", "Filename fuzzy match"],
				undefined,
				folders,
			).map(({ path }) => path),
		).toEqual(["archive-other/project.md", "archive/nested/project.md"]);
	});

	it("ソーター境界で従来のフィールド固有の一致信号を正規化します。", () => {
		const legacy = { obj: file("legacy.md", 1), score: -4 };
		const fieldSpecific = {
			obj: file("field-specific.md", 1),
			score: -1,
			filenameScore: undefined,
			aliasScore: -2,
			folderPathScore: -3,
			tagMatchCount: 2,
			matchCoverage: 5,
			contiguousMatch: true,
		};

		expect(extractFileMatchSignals(legacy)).toEqual({
			filenameScore: -4,
			aliasScore: undefined,
			folderPathScore: undefined,
			tagMatchCount: undefined,
			matchCoverage: undefined,
			contiguousMatch: undefined,
		});
		expect(extractFileMatchSignals(fieldSpecific)).toEqual({
			filenameScore: undefined,
			aliasScore: -2,
			folderPathScore: -3,
			tagMatchCount: 2,
			matchCoverage: 5,
			contiguousMatch: true,
		});
	});

	it("ファイル名とエイリアスのプレフィックスの一致を分離します", () => {
		const matches = [
			{ obj: file("project-note.md", 1), score: 0 },
			{ obj: file("archive/team-project-notes.md", 1), score: 0 },
			{ obj: file("work.md", 1, ["Project dashboard"]), score: 0 },
		];

		const filenameSorted = sortFileMatches(matches.slice(), "project", new Map(), [
			"Filename prefix match",
			"Alphabetical",
		]);
		const aliasSorted = sortFileMatches(matches.slice(), "project", new Map(), [
			"Alias prefix match",
			"Alphabetical",
		]);

		expect(filenameSorted.map(({ path }) => path)).toEqual([
			"project-note.md",
			"archive/team-project-notes.md",
			"work.md",
		]);
		expect(aliasSorted.map(({ path }) => path)).toEqual([
			"work.md",
			"project-note.md",
			"archive/team-project-notes.md",
		]);
	});

	it("ファジー スコア、アクティビティ、変更時刻、パス フォールバックをこの順序で使用します", () => {
		const matches = [
			{ obj: file("z/alpha.md", 10), score: 20 },
			{ obj: file("a/beta.md", 30), score: 20 },
			{ obj: file("b/gamma.md", 40), score: 30 },
		];
		const recent = new Map([["z/alpha.md", 0]]);

		const sorted = sortFileMatches(matches, "m", recent);

		expect(sorted.map(({ path }) => path)).toEqual(["b/gamma.md", "z/alpha.md", "a/beta.md"]);
	});

	it("アクティビティが明示的なソート優先順位である場合、永続的な使用法を使用します。", () => {
		const matches = [
			{ obj: file("rare.md", 1), score: 0 },
			{ obj: file("often.md", 1), score: 0 },
		];
		const usageScores = new Map([
			["rare.md", 0.2],
			["often.md", 0.9],
		]);

		const sorted = sortFileMatches(matches, "query", new Map(), ["Activity"], usageScores);

		expect(sorted.map(({ path }) => path)).toEqual(["often.md", "rare.md"]);
	});

	it("アクティビティ内で永続的に使用する前に、最近開いたものを優先します", () => {
		const matches = [
			{ obj: file("old.md", 1), score: 0 },
			{ obj: file("recent.md", 1), score: 0 },
		];
		const recent = new Map([["recent.md", 0]]);
		const usageScores = new Map([
			["old.md", 1],
			["recent.md", 0.1],
		]);

		const sorted = sortFileMatches(matches, "query", recent, ["Activity"], usageScores);

		expect(sorted.map(({ path }) => path)).toEqual(["recent.md", "old.md"]);
	});

	it("以前に設定された一致優先順位をアクティビティよりも前に保持します", () => {
		const matches = [
			{ obj: file("ordinary.md", 1), score: 1, filenameScore: 1 },
			{ obj: file("strong.md", 1), score: 2, filenameScore: 2 },
		];
		const usageScores = new Map([
			["ordinary.md", 1],
			["strong.md", 0],
		]);

		const sorted = sortFileMatches(
			matches,
			"query",
			new Map(),
			["Filename fuzzy match", "Activity"],
			usageScores,
		);

		expect(sorted.map(({ path }) => path)).toEqual(["strong.md", "ordinary.md"]);
	});

	it("インクルード無視検索で、無視された一致を通常のノートの前に置きます", () => {
		const matches = [
			{ obj: file("notes/new.md", 100, [], false), score: 100 },
			{ obj: file("archive/old.md", 1, [], true), score: 1 },
		];

		expect(sortFileMatches(matches, "old", new Map()).map(({ path }) => path)).toEqual([
			"archive/old.md",
			"notes/new.md",
		]);
	});

	it("入力が空の場合は、最初に最近のファイル、次に新しいファイル、次にパスの順序を表示します", () => {
		const entries = [
			file("z/charlie.md", 30),
			file("a/bravo.md", 30),
			file("x/alpha.md", 10),
			file("recent/older.md", 1),
		];
		const recent = new Map([["recent/older.md", 0]]);

		const sorted = sortFilesWithoutQuery(entries, recent);

		expect(sorted.map(({ path }) => path)).toEqual([
			"recent/older.md",
			"a/bravo.md",
			"z/charlie.md",
			"x/alpha.md",
		]);
	});

	it("Last Modified が省略された場合、パスを確定的なフォールバックとして使用します", () => {
		const entries = [file("z-note.md", 100), file("a-note.md", 1)];

		const sorted = sortFilesWithoutQuery(entries, new Map(), []);

		expect(sorted.map(({ path }) => path)).toEqual(["a-note.md", "z-note.md"]);
	});

	it("Obsidian で除外されたファイルを空の include-ignored リストの先頭に置きます", () => {
		const entries = [file("notes/new.md", 100, [], false), file("archive/old.md", 1, [], true)];

		const sorted = sortFilesWithoutQuery(entries, new Map());

		expect(sorted.map(({ path }) => path)).toEqual(["archive/old.md", "notes/new.md"]);
	});

	it("前の数値をソートし、欠損値を最後に保持します", () => {
		const entries = [
			file("missing.md", 1),
			file("low.md", 1, [], false, -1),
			file("pinned.md", 1, [], false, 999),
			file("high.md", 1, [], false, 3),
			file("medium.md", 1, [], false, 1),
		];

		const sorted = sortFilesWithoutQuery(entries, new Map(), ["@prior:desc"]);

		expect(sorted.map(({ path }) => path)).toEqual([
			"pinned.md",
			"high.md",
			"medium.md",
			"low.md",
			"missing.md",
		]);
	});

	it("設定された優先順位を左から右に適用します", () => {
		const matches = [
			{ obj: file("zeta.md", 10, [], false, 1), score: 100 },
			{ obj: file("alpha.md", 1, [], false, 3), score: 100 },
		];

		const priorities: FileSortPriority[] = ["Filename fuzzy match", "@prior:desc"];
		const sorted = sortFileMatches(matches, "query", new Map(), priorities);

		expect(sorted.map(({ path }) => path)).toEqual(["alpha.md", "zeta.md"]);
	});

	it("ファイル名とエイリアスのあいまいスコアを分離します", () => {
		const matches = [
			{
				obj: file("ordinary.md", 1, ["project"]),
				score: -1,
				filenameScore: undefined,
				aliasScore: -1,
			},
			{
				obj: file("project-notes.md", 1),
				score: -2,
				filenameScore: -2,
				aliasScore: undefined,
			},
			{
				obj: file("other.md", 1),
				score: -3,
				filenameScore: undefined,
				aliasScore: undefined,
			},
		];

		const filenameSorted = sortFileMatches(matches.slice(), "project", new Map(), [
			"Filename fuzzy match",
		]);
		const aliasSorted = sortFileMatches(matches.slice(), "project", new Map(), [
			"Alias fuzzy match",
		]);

		expect(filenameSorted.map(({ path }) => path)).toEqual([
			"project-notes.md",
			"ordinary.md",
			"other.md",
		]);
		expect(aliasSorted.map(({ path }) => path)).toEqual([
			"ordinary.md",
			"other.md",
			"project-notes.md",
		]);
	});

	it("フォルダー パスの一致を独自の優先順位として利用可能な状態に保ちます", () => {
		const matches = [
			{
				obj: file("folder/note.md", 1),
				score: -1,
				filenameScore: undefined,
				aliasScore: undefined,
				folderPathScore: -1,
			},
			{
				obj: file("alpha.md", 1),
				score: -2,
				filenameScore: undefined,
				aliasScore: undefined,
				folderPathScore: undefined,
			},
		];

		const sorted = sortFileMatches(matches, "folder", new Map(), ["Folder path match"]);

		expect(sorted.map(({ path }) => path)).toEqual(["folder/note.md", "alpha.md"]);
	});

	it("一致するタグの数によって候補をランク付けします", () => {
		const matches = [
			{ obj: file("one.md", 1), score: -1, tagMatchCount: 1 },
			{ obj: file("none.md", 1), score: -1, tagMatchCount: 0 },
			{ obj: file("many.md", 1), score: -1, tagMatchCount: 2 },
		];

		const sorted = sortFileMatches(matches, "#topic", new Map(), ["Tag match"]);

		expect(sorted.map(({ path }) => path)).toEqual(["many.md", "one.md", "none.md"]);
	});

	it("構成時に一致した文字の範囲に基づいて候補をランク付けします", () => {
		const matches = [
			{ obj: file("one.md", 1), score: -1, matchCoverage: 7 },
			{ obj: file("many.md", 1), score: -1, matchCoverage: 21 },
			{ obj: file("some.md", 1), score: -1, matchCoverage: 14 },
		];

		const sorted = sortFileMatches(matches, "project", new Map(), ["Match coverage"]);

		expect(sorted.map(({ path }) => path)).toEqual(["many.md", "some.md", "one.md"]);
	});

	it("ファジーのみの一致よりも先に連続したメタデータの一致を保持します", () => {
		const matches = [
			{ obj: file("fuzzy-chat.md", 1), score: 1, contiguousMatch: false },
			{ obj: file("exact-alias.md", 1), score: 0, contiguousMatch: true },
		];

		const sorted = sortFileMatches(matches, "cheat", new Map(), ["Filename fuzzy match"]);

		expect(sorted.map(({ path }) => path)).toEqual(["exact-alias.md", "fuzzy-chat.md"]);
	});

	it("設定されている場合は、最近の履歴より前の履歴を使用します", () => {
		const entries = [file("recent.md", 1, [], false, 1), file("important.md", 1, [], false, 3)];
		const recent = new Map([["recent.md", 0]]);

		const sorted = sortFilesWithoutQuery(entries, recent, ["@prior:desc", "Activity"]);

		expect(sorted.map(({ path }) => path)).toEqual(["important.md", "recent.md"]);
	});

	it("構成時にエイリアスの数でソートします", () => {
		const entries = [
			file("one.md", 1, ["one"]),
			file("five.md", 1, ["one", "two", "three", "four", "five"]),
			file("none.md", 1),
			file("two.md", 1, ["one", "two"]),
		];

		const sorted = sortFilesWithoutQuery(entries, new Map(), ["Aliases count"]);

		expect(sorted.map(({ path }) => path)).toEqual(["five.md", "two.md", "one.md", "none.md"]);
	});
});
