import { describe, expect, it } from "vitest";
import {
	NO_AUDIT_EXCLUSIONS,
	filterAuditReport,
	isAuditKind,
	runAudit,
	type AuditExclusions,
	type AuditFile,
	type AuditSnapshot,
} from "src/audit/vaultAudit";

function file(path: string, overrides: Partial<AuditFile> = {}): AuditFile {
	const extension = path.slice(path.lastIndexOf(".") + 1);
	return {
		path,
		extension,
		size: 10,
		mtime: 0,
		tags: [],
		openable: true,
		...(extension === "md" ? { hasContent: true } : {}),
		...overrides,
	};
}

function snapshot(overrides: Partial<AuditSnapshot> = {}): AuditSnapshot {
	return { files: [], folders: [], resolvedLinks: {}, unresolvedLinks: [], ...overrides };
}

function exclusions(overrides: Partial<AuditExclusions>): AuditExclusions {
	return { ...NO_AUDIT_EXCLUSIONS, ...overrides };
}

function paths(report: ReturnType<typeof runAudit>): string[] {
	return report.items.map((item) => ("path" in item ? item.path : item.link));
}

describe("isAuditKind", () => {
	it("accepts only the four kinds", () => {
		expect(isAuditKind("broken-links")).toBe(true);
		expect(isAuditKind("orphans")).toBe(false);
		expect(isAuditKind(undefined)).toBe(false);
	});
});

describe("orphaned files", () => {
	it("lists files no other file links to or embeds, in path order", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({
				files: [file("b.md"), file("a.md"), file("linked.md"), file("image.png")],
				resolvedLinks: { "a.md": { "linked.md": 1 }, "b.md": { "image.png": 1 } },
			}),
		);
		expect(paths(report)).toEqual(["a.md", "b.md"]);
	});

	it("treats a note that only links to itself as orphaned", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({ files: [file("self.md")], resolvedLinks: { "self.md": { "self.md": 2 } } }),
		);
		expect(paths(report)).toEqual(["self.md"]);
	});

	it("skips excluded folders, extensions, tags and the orphan-only folders", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({
				files: [
					file("keep.md"),
					file("Archive/old.md"),
					file("data.csv"),
					file("tagged.md", { tags: ["project/done"] }),
					file("Daily/2026-10-17.md"),
				],
			}),
			exclusions({
				folders: ["Archive"],
				extensions: ["csv"],
				tags: ["Project"],
				orphanFolders: ["Daily"],
			}),
		);
		expect(paths(report)).toEqual(["keep.md"]);
	});

	it("keeps a file linked only from an excluded note out of the list", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({
				files: [file("Templates/t.md"), file("target.md")],
				resolvedLinks: { "Templates/t.md": { "target.md": 1 } },
			}),
			exclusions({ folders: ["Templates"] }),
		);
		expect(paths(report)).toEqual([]);
	});
});

describe("broken links", () => {
	it("groups occurrences by link, most referenced first, with sorted sources", () => {
		const report = runAudit(
			"broken-links",
			snapshot({
				files: [file("a.md"), file("b.md")],
				unresolvedLinks: [
					{ source: "b.md", link: "Missing", line: 3 },
					{ source: "a.md", link: "Missing", line: 9 },
					{ source: "a.md", link: "Missing", line: 1 },
					{ source: "a.md", link: "Alone" },
				],
			}),
		);
		expect(report.items).toEqual([
			{
				link: "Missing",
				sources: [
					{ path: "a.md", line: 1 },
					{ path: "a.md", line: 9 },
					{ path: "b.md", line: 3 },
				],
			},
			{ link: "Alone", sources: [{ path: "a.md" }] },
		]);
	});

	it("drops links written in excluded notes", () => {
		const report = runAudit(
			"broken-links",
			snapshot({
				files: [file("Templates/t.md")],
				unresolvedLinks: [{ source: "Templates/t.md", link: "{{title}}", line: 0 }],
			}),
			exclusions({ folders: ["Templates"] }),
		);
		expect(report.items).toEqual([]);
	});
});

describe("empty files", () => {
	it("judges Markdown by its content and other files by size", () => {
		const report = runAudit(
			"empty-files",
			snapshot({
				files: [
					file("frontmatter-only.md", { hasContent: false, size: 40 }),
					file("note.md"),
					file("unindexed.md", { hasContent: undefined, size: 0 }),
					file("unindexed-text.md", { hasContent: undefined, size: 5 }),
					file("zero.png", { size: 0 }),
					file("image.png"),
				],
			}),
		);
		expect(paths(report)).toEqual(["frontmatter-only.md", "unindexed.md", "zero.png"]);
	});
});

describe("empty folders", () => {
	it("lists only the topmost empty folder with the count of empty folders inside", () => {
		const report = runAudit(
			"empty-folders",
			snapshot({
				files: [file("notes/a.md"), file("notes/deep/b.md")],
				folders: ["empty", "empty/x", "empty/x/y", "notes", "notes/deep", "notes/blank"],
			}),
		);
		expect(report.items).toEqual([
			{ path: "empty", foldersInside: 2 },
			{ path: "notes/blank", foldersInside: 0 },
		]);
	});

	it("counts a folder holding only excluded files as not empty, and skips excluded folders", () => {
		const report = runAudit(
			"empty-folders",
			snapshot({
				files: [file("hidden/a.md")],
				folders: ["hidden", "Archive", "Archive/old"],
			}),
			exclusions({ folders: ["hidden", "Archive"] }),
		);
		expect(report.items).toEqual([]);
	});
});

describe("filterAuditReport", () => {
	const startsWithNotes = (path: string) => path.startsWith("notes/");

	it("keeps files and folders by their own path", () => {
		const report = filterAuditReport(
			{
				kind: "orphaned-files",
				items: [
					{ path: "notes/a.md", size: 1, mtime: 0 },
					{ path: "other/b.md", size: 1, mtime: 0 },
				],
			},
			startsWithNotes,
		);
		expect(paths(report)).toEqual(["notes/a.md"]);
	});

	it("keeps broken links by the linking notes and drops links left without any", () => {
		const report = filterAuditReport(
			{
				kind: "broken-links",
				items: [
					{
						link: "A",
						sources: [{ path: "notes/x.md", line: 1 }, { path: "other/y.md" }],
					},
					{ link: "B", sources: [{ path: "other/y.md" }] },
				],
			},
			startsWithNotes,
		);
		expect(report.items).toEqual([{ link: "A", sources: [{ path: "notes/x.md", line: 1 }] }]);
	});
});

describe("MOC-only notes", () => {
	it("lists them as empty files with their References count", () => {
		const report = runAudit(
			"empty-files",
			snapshot({
				files: [file("moc-only.md", { mocOnly: { references: 1 } }), file("written.md")],
			}),
		);
		expect(report.items).toEqual([
			{ path: "moc-only.md", size: 10, mtime: 0, mocOnly: { references: 1 } },
		]);
	});
});

describe("files Obsidian cannot open", () => {
	it("are left out of orphaned and empty files but still keep their folder from being empty", () => {
		const files = [
			file("cog.toml", { openable: false }),
			file("config/empty.cjs", { openable: false, size: 0 }),
			file("note.md"),
		];
		const audit = (kind: Parameters<typeof runAudit>[0]) =>
			paths(runAudit(kind, snapshot({ files, folders: ["config"] })));
		expect(audit("orphaned-files")).toEqual(["note.md"]);
		expect(audit("empty-files")).toEqual([]);
		expect(audit("empty-folders")).toEqual([]);
	});
});
