import { describe, expect, it, vi } from "vitest";
import { canTrash, describeAuditActionResults, listsFiles } from "src/audit/auditActions";

vi.mock("obsidian", () => ({
	TFile: class {},
	TFolder: class {},
	getFrontMatterInfo: () => ({ contentStart: 0 }),
}));

describe("どの種類を移動できるか", () => {
	it("壊れたリンク以外はすべて破棄し、ファイルのみを別の場所に移動します", () => {
		expect(canTrash("broken-links")).toBe(false);
		expect(canTrash("empty-folders")).toBe(true);
		expect(listsFiles("orphaned-files")).toBe(true);
		expect(listsFiles("empty-files")).toBe(true);
		expect(listsFiles("empty-folders")).toBe(false);
	});
});

describe("監査アクション結果の説明", () => {
	it("何が移動したか、次に何がスキップまたは失敗したかを報告します", () => {
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

	it("フォルダに名前を付ける", () => {
		expect(
			describeAuditActionResults("empty-folders", [{ path: "x", outcome: "trashed" }]),
		).toBe("フォルダー 1 件をゴミ箱に移動しました。");
	});
});
