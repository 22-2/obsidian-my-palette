import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { listPropertyCliApi } from "src/properties/listPropertyCli";

vi.mock("obsidian", () => ({
	TFile: class {
		extension = "md";
		constructor(public path: string) {}
	},
	getFrontMatterInfo: (content: string) => ({ exists: true, frontmatter: content }),
	parseYaml: (value: string) => JSON.parse(value),
}));

function fixture(initial: unknown) {
	const File = TFile as unknown as new (path: string) => TFile;
	const file = new File("note.md");
	const frontmatter: Record<string, unknown> = { topic: initial };
	const write = vi.fn(async (_file: TFile, update: (value: Record<string, unknown>) => void) =>
		update(frontmatter),
	);
	const app = {
		vault: { getAbstractFileByPath: () => file, read: async () => JSON.stringify(frontmatter) },
		fileManager: { processFrontMatter: write },
	} as unknown as App;
	return { plugin: { app } as MyPalettePlugin, frontmatter, write };
}

it("変更前後を表示し、確認した計画でリストを編集する", async () => {
	const { plugin, frontmatter, write } = fixture(["old", "keep"]);
	const params = { paths: '["note.md"]', key: "topic", add: '["new"]', remove: '["old"]' };
	const preview = (await listPropertyCliApi.run(plugin, params)) as {
		plan: string;
		items: unknown[];
	};
	expect(preview.items).toMatchObject([{ before: ["old", "keep"], after: ["keep", "new"] }]);
	expect(write).not.toHaveBeenCalled();
	const result = await listPropertyCliApi.run(plugin, {
		...params,
		apply: "true",
		plan: preview.plan,
	});
	expect(result).toMatchObject({ items: [{ result: "updated" }] });
	expect(frontmatter.topic).toEqual(["keep", "new"]);
});

it("文字列以外を含むリストやスカラーの値を上書きしない", async () => {
	for (const value of [123, "text", ["x", 3], { nested: true }]) {
		const { plugin, write } = fixture(value);
		await expect(
			listPropertyCliApi.run(plugin, { paths: '["note.md"]', key: "topic", add: '["x"]' }),
		).rejects.toThrow("リストではありません");
		expect(write).not.toHaveBeenCalled();
	}
});

it("最後の値を削除する計画ではキーの削除を示す", async () => {
	const { plugin } = fixture(["old"]);
	const preview = await listPropertyCliApi.run(plugin, {
		paths: '["note.md"]',
		key: "topic",
		remove: '["old"]',
	});
	expect(preview).toMatchObject({ items: [{ before: ["old"], after: [], deleteKey: true }] });
});
