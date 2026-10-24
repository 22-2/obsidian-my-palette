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

describe("監査対象の種類判定", () => {
	it("4種類のみ受け付けます", () => {
		expect(isAuditKind("broken-links")).toBe(true);
		expect(isAuditKind("orphans")).toBe(false);
		expect(isAuditKind(undefined)).toBe(false);
	});
});

describe("孤立したファイル", () => {
	it("他のファイルがリンクまたは埋め込まれていないファイルをパス順にリストします。", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({
				files: [file("b.md"), file("a.md"), file("linked.md"), file("image.png")],
				resolvedLinks: { "a.md": { "linked.md": 1 }, "b.md": { "image.png": 1 } },
			}),
		);
		expect(paths(report)).toEqual(["a.md", "b.md"]);
	});

	it("自分自身にのみリンクしているノートを孤立したものとして扱います", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({ files: [file("self.md")], resolvedLinks: { "self.md": { "self.md": 2 } } }),
		);
		expect(paths(report)).toEqual(["self.md"]);
	});

	it("除外されたフォルダーと孤立したフォルダーのみをスキップします", () => {
		const report = runAudit(
			"orphaned-files",
			snapshot({
				files: [file("keep.md"), file("Archive/old.md"), file("Daily/2026-10-17.md")],
			}),
			exclusions({ folders: ["Archive"], orphanFolders: ["Daily"] }),
		);
		expect(paths(report)).toEqual(["keep.md"]);
	});

	it("除外されたノートからのみリンクされているファイルをリストから除外します", () => {
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

describe("壊れたリンク", () => {
	it("ソートされたソースを使用して、出現箇所をリンクごとにグループ化し、最も参照されているものが最初に表示されます。", () => {
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

	it("除外されたメモに書かれたリンクを削除します", () => {
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

describe("空のファイル", () => {
	it("Markdown はその内容によって判断され、他のファイルはサイズによって判断されます", () => {
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

describe("空のフォルダー", () => {
	it("最上位の空のフォルダーのみをリストし、その中にある空のフォルダーの数を表示します", () => {
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

	it("除外されたファイルのみを含むフォルダーは空ではないとカウントし、除外されたフォルダーをスキップします", () => {
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

describe("フィルター監査レポート", () => {
	const startsWithNotes = (path: string) => path.startsWith("notes/");

	it("ファイルとフォルダーを独自のパスで保持します", () => {
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

	it("壊れたリンクをリンクメモによって保持し、何もせずに残っ​​たリンクを削除します", () => {
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

describe("MOC のみのメモ", () => {
	it("それらを空のファイルとしてリストし、MOC 専用としてマークします", () => {
		const report = runAudit(
			"empty-files",
			snapshot({ files: [file("moc-only.md", { mocOnly: true }), file("written.md")] }),
		);
		expect(report.items).toEqual([{ path: "moc-only.md", size: 10, mtime: 0, mocOnly: true }]);
	});
});

describe("Obsidian では開けないファイル", () => {
	it("孤立した空のファイルは残されますが、フォルダーが空になることはありません", () => {
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
