import { describe, expect, it, vi } from "vitest";
import { canTrash, describeAuditActionResults, listsFiles } from "src/audit/auditActions";

vi.mock("obsidian", () => ({
	TFile: class {},
	TFolder: class {},
	getFrontMatterInfo: () => ({ contentStart: 0 }),
}));

describe("which kinds can be moved", () => {
	it("trashes everything but broken links and moves elsewhere files only", () => {
		expect(canTrash("broken-links")).toBe(false);
		expect(canTrash("empty-folders")).toBe(true);
		expect(listsFiles("orphaned-files")).toBe(true);
		expect(listsFiles("empty-files")).toBe(true);
		expect(listsFiles("empty-folders")).toBe(false);
	});
});

describe("describeAuditActionResults", () => {
	it("reports what moved, then what was skipped or failed", () => {
		expect(
			describeAuditActionResults("orphaned-files", [
				{ path: "a.md", outcome: "trashed" },
				{ path: "b.md", outcome: "trashed" },
				{ path: "c.md", outcome: "skipped", reason: "Now linked from a note." },
				{ path: "d.md", outcome: "failed", reason: "EBUSY" },
			]),
		).toBe(
			"ファイル 2 件をゴミ箱に移動しました。 リストの作成後に変わった 1 件はスキップしました。 1 件は失敗しました。詳細はコンソールを確認してください。",
		);
	});

	it("names folders", () => {
		expect(
			describeAuditActionResults("empty-folders", [{ path: "x", outcome: "trashed" }]),
		).toBe("フォルダー 1 件をゴミ箱に移動しました。");
	});
});
