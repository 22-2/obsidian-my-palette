import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { trashCliApi } from "src/palette/trashCli";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(
			public path: string,
			public extension: string,
		) {}
	},
}));

function setup() {
	const File = TFile as unknown as new (path: string, extension: string) => TFile;
	const file = new File("note.md", "md");
	let content = "初めの本文";
	const trashFile = vi.fn(async () => {});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
			read: async () => content,
		},
		fileManager: { trashFile },
	} as unknown as App;
	return {
		plugin: { app } as MyPalettePlugin,
		trashFile,
		setContent: (value: string) => {
			content = value;
		},
	};
}

it("プレビュー後に内容が変わったノートはゴミ箱に移さない", async () => {
	const { plugin, trashFile, setContent } = setup();
	const params = { paths: '["note.md"]' };
	const preview = (await trashCliApi.run(plugin, params)) as { plan: string };
	setContent("新しい本文");
	await expect(
		trashCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	expect(trashFile).not.toHaveBeenCalled();
});

it("確認した内容が変わっていなければゴミ箱に移す", async () => {
	const { plugin, trashFile } = setup();
	const params = { paths: '["note.md"]' };
	const preview = (await trashCliApi.run(plugin, params)) as { plan: string };
	const result = await trashCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({
		action: "trash",
		items: [{ path: "note.md", result: "trashed" }],
	});
	expect(trashFile).toHaveBeenCalledOnce();
});
