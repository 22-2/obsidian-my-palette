import { TFile, TFolder, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { moveCliApi } from "src/move/moveCli";

vi.mock("obsidian", () => ({
	TFile: class {
		name: string;
		constructor(public path: string) {
			this.name = path.split("/").pop()!;
		}
	},
	TFolder: class {
		constructor(public path: string) {}
	},
}));
vi.mock("src/ignored-notes/ignoredNoteMaterializer", () => ({ materializeIgnoredNote: vi.fn() }));

function setup() {
	const File = TFile as unknown as new (path: string) => TFile;
	const Folder = TFolder as unknown as new (path: string) => TFolder;
	const entries = new Map<string, TFile | TFolder>([
		["dest", new Folder("dest")],
		["a.md", new File("a.md")],
		["other/a.md", new File("other/a.md")],
	]);
	const renameFile = vi.fn(async () => {});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => entries.get(path) ?? null,
			getAllLoadedFiles: () => [...entries.values()],
		},
		fileManager: { renameFile },
	} as unknown as App;
	return { plugin: { app } as MyPalettePlugin, entries, renameFile, File };
}

it("プレビューした計画だけを移動し、実行前の衝突を検出する", async () => {
	const { plugin, entries, renameFile, File } = setup();
	const params = { paths: '["a.md"]', folder: "dest" };
	const preview = (await moveCliApi.run(plugin, params)) as { plan: string; blocked: boolean };
	expect(preview.blocked).toBe(false);
	expect(renameFile).not.toHaveBeenCalled();
	entries.set("dest/a.md", new File("dest/a.md"));
	await expect(
		moveCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	expect(renameFile).not.toHaveBeenCalled();
	entries.delete("dest/a.md");
	const result = await moveCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({ action: "move", items: [{ path: "a.md", result: "moved" }] });
	expect(renameFile).toHaveBeenCalledOnce();
});

it("同名の対象を同じフォルダーへ移さない", async () => {
	const { plugin, renameFile } = setup();
	const params = { paths: '["a.md","other/a.md"]', folder: "dest" };
	const preview = (await moveCliApi.run(plugin, params)) as { plan: string; blocked: boolean };
	expect(preview.blocked).toBe(true);
	await expect(
		moveCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("衝突");
	expect(renameFile).not.toHaveBeenCalled();
});
