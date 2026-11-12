import { TFile, type App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { renameCliApi } from "src/rename/renameCli";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(public path: string) {}
	},
}));

function setup() {
	const Ctor = TFile as unknown as new (path: string) => TFile;
	const files = new Map(["a_old.md", "b_old.md"].map((path) => [path, new Ctor(path)]));
	const renameFile = vi.fn(async (file: TFile, path: string) => {
		if (file.path === "a_old.md") throw new Error("locked");
		files.delete(file.path);
		file.path = path;
		files.set(path, file);
	});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			getAllLoadedFiles: () => [...files.values()],
		},
		fileManager: { renameFile },
	} as unknown as App;
	return { plugin: { app } as MyPalettePlugin, files, renameFile };
}

describe("名前変更 CLI", () => {
	const params = { paths: '["a_old.md","b_old.md"]', rule: "old/new" };
	it("プレビュー後に確認した計画だけを実行し、失敗しても残りを処理する", async () => {
		const { plugin, renameFile } = setup();
		const preview = (await renameCliApi.run(plugin, params)) as {
			plan: string;
			items: unknown[];
		};
		expect(renameFile).not.toHaveBeenCalled();
		expect(preview.items).toHaveLength(2);
		const result = await renameCliApi.run(plugin, {
			...params,
			apply: "true",
			plan: preview.plan,
		});
		expect(result).toEqual({
			action: "rename",
			plan: preview.plan,
			items: [
				{ path: "a_old.md", newPath: "a_new.md", result: "failed", reason: "locked" },
				{ path: "b_old.md", newPath: "b_new.md", result: "renamed" },
			],
		});
	});
	it("プレビュー後に新しい衝突ができたら実行しない", async () => {
		const { plugin, files, renameFile } = setup();
		const preview = (await renameCliApi.run(plugin, params)) as { plan: string };
		const Ctor = TFile as unknown as new (path: string) => TFile;
		files.set("b_new.md", new Ctor("b_new.md"));
		await expect(
			renameCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
		).rejects.toThrow("計画が一致しません");
		expect(renameFile).not.toHaveBeenCalled();
	});
	it("対象が不正または存在しない場合や計画の指定がない場合は実行しない", async () => {
		const { plugin, renameFile } = setup();
		await expect(renameCliApi.run(plugin, { ...params, paths: "[]" })).rejects.toThrow();
		await expect(
			renameCliApi.run(plugin, { ...params, paths: '["missing.md"]' }),
		).rejects.toThrow();
		await expect(renameCliApi.run(plugin, { ...params, apply: "true" })).rejects.toThrow();
		expect(renameFile).not.toHaveBeenCalled();
	});
});
