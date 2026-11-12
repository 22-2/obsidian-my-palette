import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { tagCliApi } from "src/tags/tagCli";

vi.mock("obsidian", () => ({
	TFile: class {
		extension = "md";
		constructor(public path: string) {}
	},
	parseFrontMatterTags: (frontmatter: { tags?: string[] }) => frontmatter?.tags ?? [],
}));

function fixture() {
	const File = TFile as unknown as new (path: string) => TFile;
	const file = new File("note.md");
	const frontmatter: Record<string, unknown> = { tags: ["old"] };
	let content = "old content";
	const write = vi.fn(async (_file: TFile, update: (value: Record<string, unknown>) => void) =>
		update(frontmatter),
	);
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
			read: async () => content,
		},
		metadataCache: { getFileCache: () => ({ frontmatter }) },
		fileManager: { processFrontMatter: write },
	} as unknown as App;
	return {
		plugin: { app } as MyPalettePlugin,
		frontmatter,
		write,
		setContent: (value: string) => {
			content = value;
		},
	};
}

it("確認した計画でフロントマターのタグを追加・削除する", async () => {
	const { plugin, frontmatter, write } = fixture();
	const params = { paths: '["note.md"]', add: '["new"]', remove: '["old"]' };
	const preview = (await tagCliApi.run(plugin, params)) as { plan: string };
	expect(write).not.toHaveBeenCalled();
	const result = await tagCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({
		action: "edit-tags",
		items: [{ path: "note.md", result: "updated" }],
	});
	expect(frontmatter.tags).toEqual(["new"]);
});

it("確認後の変更や追加と削除の重複を拒否する", async () => {
	const { plugin, write, setContent } = fixture();
	const params = { paths: '["note.md"]', add: '["new"]' };
	const preview = (await tagCliApi.run(plugin, params)) as { plan: string };
	setContent("changed");
	await expect(
		tagCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	await expect(tagCliApi.run(plugin, { ...params, remove: '["NEW"]' })).rejects.toThrow();
	expect(write).not.toHaveBeenCalled();
});
