import type { TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { formatSize, toAuditResults } from "src/search/audit/AuditProvider";

vi.mock("obsidian", () => ({ TFile: class {} }));

function file(path: string): TFile {
	return { path, name: path.split("/").at(-1) } as TFile;
}

describe("toAuditResults", () => {
	it("names files by their name and drops files that no longer exist", () => {
		const results = toAuditResults(
			{
				kind: "orphaned-files",
				items: [
					{ path: "notes/a.md", size: 2048, mtime: 0 },
					{ path: "gone.md", size: 1, mtime: 0 },
				],
			},
			(path) => (path === "gone.md" ? undefined : file(path)),
		);
		expect(results).toEqual([
			expect.objectContaining({
				kind: "orphaned-files",
				primary: "a.md",
				secondary: "notes/a.md · 2.0 KB",
				size: 2048,
			}),
		]);
	});

	it("counts the linking notes once each and names the first one", () => {
		const [result] = toAuditResults(
			{
				kind: "broken-links",
				items: [
					{
						link: "Missing",
						sources: [
							{ path: "a.md", line: 1 },
							{ path: "a.md", line: 5 },
							{ path: "b.md", line: 2 },
						],
					},
				],
			},
			() => undefined,
		);
		expect(result).toEqual(
			expect.objectContaining({ primary: "Missing", secondary: "2 notes · a.md" }),
		);
	});

	it("mentions the empty folders inside only when there are some", () => {
		const results = toAuditResults(
			{
				kind: "empty-folders",
				items: [
					{ path: "a/empty", foldersInside: 0 },
					{ path: "tree", foldersInside: 1 },
				],
			},
			() => undefined,
		);
		expect(results.map(({ primary, secondary }) => [primary, secondary])).toEqual([
			["empty", "a/empty"],
			["tree", "tree · 1 folder inside"],
		]);
	});
});

describe("formatSize", () => {
	it("uses bytes below 1 KB and one decimal below 10 units", () => {
		expect(formatSize(0)).toBe("0 B");
		expect(formatSize(1023)).toBe("1023 B");
		expect(formatSize(1536)).toBe("1.5 KB");
		expect(formatSize(20 * 1024)).toBe("20 KB");
		expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
	});
});
