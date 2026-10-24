import type { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditVault } from "src/audit/auditSnapshot";
import { AuditProvider, toAuditResults } from "src/search/audit/AuditProvider";
import { DEFAULT_SETTINGS, type MyPaletteSettings } from "src/settings/model";

vi.mock("obsidian", () => ({ TFile: class {} }));
vi.mock("src/audit/auditSnapshot", () => ({
	auditExclusions: (_app: App, settings: MyPaletteSettings) => settings.file.excludedFolders,
	auditVault: vi.fn(),
}));

function file(path: string): TFile {
	return { path, name: path.split("/").at(-1) } as TFile;
}

describe("監査結果へ", () => {
	it("ファイルに名前を付けて、存在しないファイルを削除します", () => {
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

	it("リンクするノートを 1 回ずつ数えて、最初のノートに名前を付けます", () => {
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
			expect.objectContaining({ primary: "Missing", secondary: "ノート 2 件 · a.md" }),
		);
	});

	it("いくつかの空のフォルダーがある場合にのみ、内部の空のフォルダーについて言及します。", () => {
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
			["tree", "tree · 内部に 1 件のフォルダー"],
		]);
	});
});

describe("監査プロバイダー", () => {
	beforeEach(() => {
		vi.mocked(auditVault).mockReset();
		vi.mocked(auditVault).mockResolvedValue({
			kind: "orphaned-files",
			items: [
				{ path: "a.md", size: 1, mtime: 0 },
				{ path: "b.md", size: 1, mtime: 0 },
			],
		});
	});

	function fixture() {
		const handlers: Array<() => void> = [];
		const on = (_name: string, handler: () => void) => {
			handlers.push(handler);
			return {};
		};
		const app = {
			vault: { on, offref: vi.fn(), getFileByPath: file },
			metadataCache: { on, offref: vi.fn() },
		} as unknown as App;
		const settings = structuredClone(DEFAULT_SETTINGS);
		const provider = new AuditProvider(app, () => settings);
		return { provider, handlers, settings };
	}

	it("再度監査することなく、入力中に保持されている行をフィルタリングします。", async () => {
		const { provider } = fixture();
		await provider.search({ mode: "audit", query: "" });
		const results = await provider.search({ mode: "audit", query: "b" });
		expect(results.map(({ primary }) => primary)).toEqual(["b.md"]);
		expect(auditVault).toHaveBeenCalledTimes(1);
	});

	it("ボールトの変更または設定の変更後に再度監査する", async () => {
		const { provider, handlers, settings } = fixture();
		await provider.search({ mode: "audit", query: "" });
		handlers[0]?.();
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(2);

		settings.file.excludedFolders = ["Archive"];
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(3);
	});

	it("変更がその種類に影響を与えない場合は結果を保持します", async () => {
		const { provider, handlers, settings } = fixture();
		settings.audit.kind = "orphaned-files";
		await provider.search({ mode: "audit", query: "" });
		// Why: 本文の保存(modify)は浮いたファイルの判定を変えない。
		handlers[1]?.();
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(1);

		handlers[0]?.();
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(2);
	});

	it("失敗した監査を保持しない", async () => {
		const { provider } = fixture();
		vi.mocked(auditVault).mockRejectedValueOnce(new Error("boom"));
		await expect(provider.search({ mode: "audit", query: "" })).rejects.toThrow("boom");
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(2);
	});
});
