import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { scalarPropertyCliApi } from "src/features/properties/scalarPropertyCli";

vi.mock("obsidian", () => ({
	TFile: class {
		extension = "md";
		constructor(public path: string) {}
	},
	getFrontMatterInfo: (content: string) => ({ exists: true, frontmatter: content }),
	parseYaml: (content: string) => JSON.parse(content),
}));

function fixture(value: unknown) {
	const File = TFile as unknown as new (path: string) => TFile;
	const file = new File("note.md");
	const frontmatter: Record<string, unknown> = { score: value };
	const write = vi.fn(async (_file: TFile, update: (data: Record<string, unknown>) => void) =>
		update(frontmatter),
	);
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
			read: async () => JSON.stringify(frontmatter),
		},
		fileManager: { processFrontMatter: write },
	} as unknown as App;
	return { plugin: { app } as MyPalettePlugin, frontmatter, write };
}

it("数値の変更をプレビューして設定する", async () => {
	const { plugin, frontmatter, write } = fixture(1);
	const params = { paths: '["note.md"]', key: "score", kind: "number", value: "2.5" };
	const preview = (await scalarPropertyCliApi.run(plugin, params)) as {
		plan: string;
		items: unknown[];
	};
	expect(preview.items).toMatchObject([{ exists: true, before: 1, after: 2.5 }]);
	expect(write).not.toHaveBeenCalled();
	const result = await scalarPropertyCliApi.run(plugin, {
		...params,
		apply: "true",
		plan: preview.plan,
	});
	expect(result).toMatchObject({ items: [{ path: "note.md", result: "updated" }] });
	expect(frontmatter.score).toBe(2.5);
});

it("確認後の変更、型不一致、不正な日付や予約キーを拒否する", async () => {
	const { plugin, frontmatter, write } = fixture(1);
	const params = { paths: '["note.md"]', key: "score", kind: "number", value: "2" };
	const preview = (await scalarPropertyCliApi.run(plugin, params)) as { plan: string };
	frontmatter.score = 3;
	await expect(
		scalarPropertyCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	await expect(
		scalarPropertyCliApi.run(plugin, { ...params, kind: "checkbox", value: "true" }),
	).rejects.toThrow("種類と一致しません");
	await expect(
		scalarPropertyCliApi.run(plugin, {
			...params,
			key: "date",
			kind: "date",
			value: "2026-02-30",
		}),
	).rejects.toThrow();
	await expect(scalarPropertyCliApi.run(plugin, { ...params, key: "tags" })).rejects.toThrow();
	expect(write).not.toHaveBeenCalled();
});

it("チェックボックスを真偽値として設定する", async () => {
	const { plugin, frontmatter } = fixture(false);
	const params = { paths: '["note.md"]', key: "score", kind: "checkbox", value: "true" };
	const preview = (await scalarPropertyCliApi.run(plugin, params)) as { plan: string };
	await scalarPropertyCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(frontmatter.score).toBe(true);
});
