import { describe, expect, it, vi } from "vitest";
import {
	archivePath,
	canArchive,
	canTrash,
	describeAuditActionResults,
} from "src/audit/auditActions";

vi.mock("obsidian", () => ({
	TFile: class {},
	TFolder: class {},
	getFrontMatterInfo: () => ({ contentStart: 0 }),
	normalizePath: (path: string) => path.replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
}));

describe("which kinds can be moved", () => {
	it("trashes everything but broken links and archives files only", () => {
		expect(canTrash("broken-links")).toBe(false);
		expect(canTrash("empty-folders")).toBe(true);
		expect(canArchive("orphaned-files")).toBe(true);
		expect(canArchive("empty-files")).toBe(true);
		expect(canArchive("empty-folders")).toBe(false);
	});
});

describe("archivePath", () => {
	it("keeps the vault path under the archive folder", () => {
		expect(archivePath("Archive", "notes/a.md")).toBe("Archive/notes/a.md");
	});
});

describe("describeAuditActionResults", () => {
	it("reports what moved, then what was skipped or failed", () => {
		expect(
			describeAuditActionResults("trash", "orphaned-files", [
				{ path: "a.md", outcome: "trashed" },
				{ path: "b.md", outcome: "trashed" },
				{ path: "c.md", outcome: "skipped", reason: "Now linked from a note." },
				{ path: "d.md", outcome: "failed", reason: "EBUSY" },
			]),
		).toBe(
			"Moved 2 files to trash. Skipped 1 that changed since the list was made. 1 failed; see the console.",
		);
	});

	it("names folders and the archive folder", () => {
		expect(
			describeAuditActionResults("trash", "empty-folders", [
				{ path: "x", outcome: "trashed" },
			]),
		).toBe("Moved 1 folder to trash.");
		expect(
			describeAuditActionResults("archive", "empty-files", [
				{ path: "x.md", outcome: "archived" },
			]),
		).toBe("Moved 1 file to the archive folder.");
	});
});
