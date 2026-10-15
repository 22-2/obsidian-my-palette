import { describe, expect, it } from "vitest";
import {
	isBlocked,
	parseRenameRule,
	planRename,
	renamableRows,
	type RenameOptions,
} from "src/rename/renamePlan";

const defaults: RenameOptions = { regex: false, matchCase: true, all: true };

function plan(
	input: string,
	paths: string[],
	options: Partial<RenameOptions> = {},
	existing: string[] = paths,
) {
	return planRename(
		paths,
		parseRenameRule(input, { ...defaults, ...options }),
		new Set(existing.map((path) => path.toLowerCase())),
	);
}

describe("parseRenameRule", () => {
	it("waits for the slash and a non-empty find part", () => {
		expect(parseRenameRule("_", defaults).kind).toBe("none");
		expect(parseRenameRule("/x", defaults).kind).toBe("none");
	});

	it("reports an invalid regular expression", () => {
		expect(parseRenameRule("(/x", { ...defaults, regex: true }).kind).toBe("error");
	});
});

describe("planRename", () => {
	it("replaces literal text in every name and keeps extension and folder", () => {
		const rows = plan("_/-", ["a/2026_01_02.md", "b_c.png"]);
		expect(rows.map((row) => row.newPath)).toEqual(["a/2026-01-02.md", "b-c.png"]);
		expect(rows.every((row) => row.status === "ready")).toBe(true);
	});

	it("never matches the extension", () => {
		expect(plan("md/x", ["note.md"])[0].status).toBe("unchanged");
	});

	it("replaces only the first match unless all occurrences is on", () => {
		expect(plan("a/b", ["aaa.md"], { all: false })[0].newName).toBe("baa.md");
		expect(plan("a/b", ["aaa.md"])[0].newName).toBe("bbb.md");
	});

	it("honors match case", () => {
		expect(plan("a/x", ["A.md"])[0].status).toBe("unchanged");
		expect(plan("a/x", ["A.md"], { matchCase: false })[0].newName).toBe("x.md");
	});

	it("keeps dollar sequences literal outside regex mode", () => {
		expect(plan("a/$&", ["a.md"])[0].newName).toBe("$&.md");
	});

	it("supports groups and anchors in regex mode", () => {
		expect(plan("^(\\d+)/n$1-", ["12 note.md"], { regex: true })[0].newName).toBe(
			"n12- note.md",
		);
	});

	it("flags names Obsidian would reject", () => {
		expect(plan("a/b/c", ["a.md"], { regex: true })[0].status).toBe("invalid");
		expect(plan("a/", ["a.md"])[0].status).toBe("invalid");
		expect(plan("a/x.", ["a.md"])[0].status).toBe("invalid");
	});

	it("flags a name that already exists, but allows a case-only change", () => {
		expect(plan("a/b", ["a.md"], {}, ["a.md", "b.md"])[0].status).toBe("exists");
		expect(plan("a/A", ["a.md"])[0].status).toBe("ready");
	});

	it("flags files that would get the same new name", () => {
		const rows = plan("1/", ["x1.md", "x.md2"].slice(0, 1).concat(["x11.md"]), {}, [
			"x1.md",
			"x11.md",
		]);
		expect(rows.map((row) => row.status)).toEqual(["duplicate", "duplicate"]);
	});

	it("blocks only when a row is a problem", () => {
		expect(isBlocked(plan("a/b", ["a.md", "c.md"]))).toBe(false);
		expect(isBlocked(plan("a/", ["a.md"]))).toBe(true);
		expect(renamableRows(plan("a/b", ["a.md", "c.md"]))).toHaveLength(1);
	});
});
