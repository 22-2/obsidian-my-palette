import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import { moveFiles } from "src/palette/moveFiles";

vi.mock("obsidian", () => ({
	TFile: class {
		name: string;
		constructor(public path: string) {
			this.name = path.split("/").pop()!;
		}
	},
}));
vi.mock("src/ignored-notes/ignoredNoteMaterializer", () => ({ materializeIgnoredNote: vi.fn() }));

it("移動元を順番に処理し、失敗しても残りを移動する", async () => {
	const File = TFile as unknown as new (path: string) => TFile;
	const first = new File("a.md");
	const second = new File("b.md");
	const already = new File("dest/c.md");
	const imported = new File("imported.md");
	vi.mocked(materializeIgnoredNote).mockResolvedValue(imported);
	const renameFile = vi.fn(async (file: TFile) => {
		if (file === first) throw new Error("locked");
	});
	const app = { fileManager: { renameFile } } as unknown as App;
	const results = await moveFiles(
		app,
		[first, second, already, { excludedPath: "ignored.md" }],
		"dest",
	);
	expect(results).toEqual([
		{ path: "a.md", result: "failed", reason: "locked" },
		{ path: "b.md", result: "moved" },
		{ path: "dest/c.md", result: "unchanged" },
		{ path: "ignored.md", result: "moved" },
	]);
	expect(renameFile.mock.calls.map(([file]) => file.path)).toEqual([
		"a.md",
		"b.md",
		"imported.md",
	]);
});
