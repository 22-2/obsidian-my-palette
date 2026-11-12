import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import { trashFiles, trashNotes } from "src/features/trash/trashNotes";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(
			public path: string,
			public extension: string,
		) {}
	},
}));

it("実行時に Markdown を確認し、失敗しても残りを処理する", async () => {
	const File = TFile as unknown as new (path: string, extension: string) => TFile;
	const files = new Map([
		["a.md", new File("a.md", "md")],
		["b.md", new File("b.md", "md")],
		["x.png", new File("x.png", "png")],
	]);
	const trashFile = vi.fn(async (file: TFile) => {
		if (file.path === "a.md") throw new Error("locked");
	});
	const app = {
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
		fileManager: { trashFile },
	} as unknown as App;
	const results = await trashNotes(app, ["a.md", "b.md", "x.png", "missing.md"]);
	expect(results).toEqual([
		{ path: "a.md", result: "failed", reason: "locked" },
		{ path: "b.md", result: "trashed" },
		{ path: "x.png", result: "failed", reason: expect.any(String) },
		{ path: "missing.md", result: "failed", reason: expect.any(String) },
	]);
	expect(trashFile).toHaveBeenCalledTimes(2);
});

it("trashFiles は拡張子を問わず移し、Vault にないパスだけを失敗にする", async () => {
	const File = TFile as unknown as new (path: string, extension: string) => TFile;
	const files = new Map([
		["a.md", new File("a.md", "md")],
		["Sample.base", new File("Sample.base", "base")],
		["x.png", new File("x.png", "png")],
	]);
	const trashFile = vi.fn(async () => {});
	const app = {
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
		fileManager: { trashFile },
	} as unknown as App;
	const results = await trashFiles(app, ["a.md", "Sample.base", "x.png", "missing.base"]);
	expect(results).toEqual([
		{ path: "a.md", result: "trashed" },
		{ path: "Sample.base", result: "trashed" },
		{ path: "x.png", result: "trashed" },
		{ path: "missing.base", result: "failed", reason: expect.any(String) },
	]);
	expect(trashFile).toHaveBeenCalledTimes(3);
});
