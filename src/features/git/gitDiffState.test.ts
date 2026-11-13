import { describe, expect, it } from "vitest";
import { gitDiffState } from "src/features/git/gitDiffState";

describe("gitDiffState", () => {
	it("compares each side at its actual path, including additions, deletions and renames", () => {
		expect(gitDiffState("new", ["old"], { status: "M", path: "note.md" })).toEqual({
			left: { hash: "old", path: "note.md" },
			right: { hash: "new", path: "note.md" },
		});
		expect(
			gitDiffState("new", ["old"], { status: "A", path: "note.md" }).left.hash,
		).toBeUndefined();
		expect(
			gitDiffState("new", ["old"], { status: "D", path: "note.md" }).right.hash,
		).toBeUndefined();
		expect(
			gitDiffState("new", ["old"], { status: "R100", path: "new.md", oldPath: "old.md" }),
		).toEqual({
			left: { hash: "old", path: "old.md" },
			right: { hash: "new", path: "new.md" },
		});
		expect(gitDiffState("new", [], { status: "A", path: "note.md" }).left.hash).toBeUndefined();
	});
});
