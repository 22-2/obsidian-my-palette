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

describe("AuditProvider", () => {
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

	it("filters the kept rows while typing, without auditing again", async () => {
		const { provider } = fixture();
		await provider.search({ mode: "audit", query: "" });
		const results = await provider.search({ mode: "audit", query: "b" });
		expect(results.map(({ primary }) => primary)).toEqual(["b.md"]);
		expect(auditVault).toHaveBeenCalledTimes(1);
	});

	it("audits again after a vault change or a settings change", async () => {
		const { provider, handlers, settings } = fixture();
		await provider.search({ mode: "audit", query: "" });
		handlers[0]?.();
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(2);

		settings.file.excludedFolders = ["Archive"];
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(3);
	});

	it("does not keep a failed audit", async () => {
		const { provider } = fixture();
		vi.mocked(auditVault).mockRejectedValueOnce(new Error("boom"));
		await expect(provider.search({ mode: "audit", query: "" })).rejects.toThrow("boom");
		await provider.search({ mode: "audit", query: "" });
		expect(auditVault).toHaveBeenCalledTimes(2);
	});
});
