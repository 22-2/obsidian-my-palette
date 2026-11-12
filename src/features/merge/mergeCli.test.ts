import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { mergeCliApi } from "src/features/merge/mergeCli";

vi.mock("obsidian", () => ({
	TFile: class {
		basename: string;
		extension = "md";
		constructor(public path: string) {
			this.basename = path.slice(0, -3);
		}
	},
}));

function fixture() {
	const File = TFile as unknown as new (path: string) => TFile;
	const files = new Map([
		["source.md", new File("source.md")],
		["target.md", new File("target.md")],
	]);
	const contents = new Map([
		["source.md", "source"],
		["target.md", "target"],
	]);
	const trashFile = vi.fn(async () => {});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			read: async (file: TFile) => contents.get(file.path)!,
			process: async (file: TFile, fn: (value: string) => string) => {
				const updated = fn(contents.get(file.path)!);
				contents.set(file.path, updated);
				return updated;
			},
		},
		metadataCache: {
			resolvedLinks: {},
			getFileCache: () => ({ frontmatter: {} }),
			getFirstLinkpathDest: () => null,
		},
		fileManager: {
			processFrontMatter: async (
				_file: TFile,
				fn: (value: Record<string, unknown>) => void,
			) => fn({}),
			trashFile,
		},
	} as unknown as App;
	return { plugin: { app } as MyPalettePlugin, contents, trashFile };
}

it("統合をプレビューしてから実行し、統合元をゴミ箱に移す", async () => {
	const { plugin, contents, trashFile } = fixture();
	const params = { paths: '["source.md"]', target: "target.md" };
	const preview = (await mergeCliApi.run(plugin, params)) as { plan: string; sources: string[] };
	expect(preview.sources).toEqual(["source.md"]);
	expect(trashFile).not.toHaveBeenCalled();
	const result = await mergeCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({ merged: true, trashed: 1, failures: [] });
	expect(contents.get("target.md")).toContain("source");
	expect(trashFile).toHaveBeenCalledOnce();
});

it("確認後に統合元が変わると実行しない", async () => {
	const { plugin, contents, trashFile } = fixture();
	const params = { paths: '["source.md"]', target: "target.md" };
	const preview = (await mergeCliApi.run(plugin, params)) as { plan: string };
	contents.set("source.md", "changed");
	await expect(
		mergeCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	expect(trashFile).not.toHaveBeenCalled();
});
