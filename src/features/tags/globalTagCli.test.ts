import type { App, TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { deleteTagsCliApi, renameTagCliApi } from "src/features/tags/globalTagCli";

vi.mock("obsidian", () => ({
	getFrontMatterInfo: (content: string) => {
		const match = /^---\n(.*?)\n---\n/s.exec(content);
		return { exists: Boolean(match), frontmatter: match?.[1] ?? "" };
	},
	parseYaml: (text: string) => JSON.parse(text),
	parseFrontMatterTags: (fm: { tags?: string[] }) => fm?.tags ?? [],
	parseFrontMatterAliases: (fm: { aliases?: string[] }) => fm?.aliases ?? [],
}));

function fixture() {
	const file = { path: "note.md" } as TFile;
	let content = '---\n{"tags":["old"],"aliases":["#old"]}\n---\n本文 #old/child';
	const offset = content.lastIndexOf("#old/child");
	const frontmatter: Record<string, unknown> = { tags: ["old"], aliases: ["#old"] };
	const cache = {
		frontmatter,
		tags: [
			{ tag: "#old/child", position: { start: { offset }, end: { offset: offset + 10 } } },
		],
	};
	const process = vi.fn(async (_file: TFile, update: (value: string) => string) => {
		content = update(content);
		return content;
	});
	const app = {
		vault: { getMarkdownFiles: () => [file], read: async () => content, process },
		metadataCache: { getFileCache: () => cache },
		fileManager: {
			processFrontMatter: async (
				_file: TFile,
				update: (value: Record<string, unknown>) => void,
			) => update(frontmatter),
		},
	} as unknown as App;
	return {
		plugin: { app } as MyPalettePlugin,
		frontmatter,
		process,
		getContent: () => content,
		setContent: (value: string) => {
			content = value;
		},
	};
}

it("タグ名変更で子タグとフロントマターの変更を確認し、適用する", async () => {
	const { plugin, frontmatter, process, getContent } = fixture();
	const params = { from: "old", to: "new" };
	const preview = (await renameTagCliApi.run(plugin, params)) as {
		plan: string;
		items: unknown[];
	};
	expect(preview.items).toMatchObject([
		{
			path: "note.md",
			inlineCount: 1,
			properties: [
				{ key: "tags", after: ["new"] },
				{ key: "aliases", after: ["#new"] },
			],
		},
	]);
	expect(process).not.toHaveBeenCalled();
	const result = await renameTagCliApi.run(plugin, {
		...params,
		apply: "true",
		plan: preview.plan,
	});
	expect(result).toMatchObject({ items: [{ result: "changed" }] });
	expect(getContent()).toContain("#new/child");
	expect(frontmatter.tags).toEqual(["new"]);
});

it("タグ削除は変更後に計画が一致しなければ実行しない", async () => {
	const { plugin, process, getContent, setContent } = fixture();
	const params = { tags: '["old"]' };
	const preview = (await deleteTagsCliApi.run(plugin, params)) as { plan: string };
	setContent(getContent() + " 変更");
	await expect(
		deleteTagsCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	expect(process).not.toHaveBeenCalled();
});

it("古いタグ位置の計画はブロックし、適用しない", async () => {
	const { plugin, process, setContent } = fixture();
	setContent('---\n{"tags":["old"]}\n---\n位置が変わった #old/child');
	const params = { from: "old", to: "new" };
	const preview = (await renameTagCliApi.run(plugin, params)) as {
		plan: string;
		blocked: boolean;
	};
	expect(preview.blocked).toBe(true);
	await expect(
		renameTagCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("タグの位置が古い");
	expect(process).not.toHaveBeenCalled();
});
