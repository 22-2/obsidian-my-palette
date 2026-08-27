import { describe, expect, it } from "vitest";
import {
	sortFileMatches,
	sortFilesWithoutQuery,
	type SortableFileEntry,
} from "src/search/file/fileSorting";
import type { FileSortPriority } from "src/model/settings";

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

describe("file sorting", () => {
	it("puts file-name and alias prefix matches before stronger fuzzy matches", () => {
		const matches = [
			{ obj: file("notes/my-project.md", 1), score: 10 },
			{ obj: file("archive/team-project-notes.md", 1), score: 100 },
			{ obj: file("notes/work.md", 1, ["Project dashboard"]), score: 5 },
		];

		const sorted = sortFileMatches(matches, "project", new Map());

		expect(sorted.map(({ path }) => path)).toEqual([
			"notes/work.md",
			"archive/team-project-notes.md",
			"notes/my-project.md",
		]);
	});

	it("uses fuzzy score, recent history, modified time, and file name in that order", () => {
		const matches = [
			{ obj: file("z/alpha.md", 10), score: 20 },
			{ obj: file("a/beta.md", 30), score: 20 },
			{ obj: file("b/gamma.md", 40), score: 30 },
		];
		const recent = new Map([["z/alpha.md", 0]]);

		const sorted = sortFileMatches(matches, "m", recent);

		expect(sorted.map(({ path }) => path)).toEqual(["b/gamma.md", "z/alpha.md", "a/beta.md"]);
	});

	it("puts ignored matches before normal notes in an include-ignored search", () => {
		const matches = [
			{ obj: file("notes/new.md", 100, [], false), score: 100 },
			{ obj: file("archive/old.md", 1, [], true), score: 1 },
		];

		expect(sortFileMatches(matches, "old", new Map()).map(({ path }) => path)).toEqual([
			"archive/old.md",
			"notes/new.md",
		]);
	});

	it("shows recent files first, then newer files, then file-name order when input is empty", () => {
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

	it("puts ignored notes first for an empty include-ignored listing", () => {
		const entries = [file("notes/new.md", 100, [], false), file("archive/old.md", 1, [], true)];

		const sorted = sortFilesWithoutQuery(entries, new Map());

		expect(sorted.map(({ path }) => path)).toEqual(["archive/old.md", "notes/new.md"]);
	});

	it("sorts numeric prior values and keeps missing values last", () => {
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

	it("applies configured priorities from left to right", () => {
		const matches = [
			{ obj: file("zeta.md", 10, [], false, 1), score: 100 },
			{ obj: file("alpha.md", 1, [], false, 3), score: 100 },
		];

		const priorities: FileSortPriority[] = ["Fuzzy name match", "@prior:desc"];
		const sorted = sortFileMatches(matches, "query", new Map(), priorities);

		expect(sorted.map(({ path }) => path)).toEqual(["alpha.md", "zeta.md"]);
	});

	it("uses prior before recent history when configured", () => {
		const entries = [file("recent.md", 1, [], false, 1), file("important.md", 1, [], false, 3)];
		const recent = new Map([["recent.md", 0]]);

		const sorted = sortFilesWithoutQuery(entries, recent, ["@prior:desc", "Last opened"]);

		expect(sorted.map(({ path }) => path)).toEqual(["important.md", "recent.md"]);
	});

	it("sorts by the number of aliases when configured", () => {
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
