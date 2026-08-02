import { describe, expect, it } from "vitest";
import {
	sortFileMatches,
	sortFilesWithoutQuery,
	type SortableFileEntry,
} from "src/providers/fileSorting";

function file(path: string, mtime: number, aliases: string[] = []): SortableFileEntry {
	return {
		path,
		basename:
			path
				.split("/")
				.at(-1)
				?.replace(/\.[^.]+$/, "") ?? path,
		aliases,
		mtime,
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
});
