import { TFile, type App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { mocCliApi } from "src/moc-relateds/mocCli";

vi.mock("obsidian", () => ({
	TFile: class {
		extension = "md";
		basename: string;
		constructor(public path: string) {
			this.basename = path.slice(0, -3);
		}
	},
}));

function fixture() {
	const File = TFile as unknown as new (path: string) => TFile;
	const files = new Map([
		["MOC.md", new File("MOC.md")],
		["Note.md", new File("Note.md")],
	]);
	const contents = new Map([
		["MOC.md", "## MOC\n- Relateds\n"],
		["Note.md", "## MOC\n- Relateds\n"],
	]);
	const process = vi.fn(async (file: TFile, update: (content: string) => string) => {
		const result = update(contents.get(file.path)!);
		contents.set(file.path, result);
		return result;
	});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => files.get(path) ?? null,
			read: async (file: TFile) => contents.get(file.path)!,
			getConfig: () => 4,
			process,
		},
	} as unknown as App;
	return { plugin: { app } as MyPalettePlugin, contents, process };
}

it("相互リンクをプレビューして確認した計画を適用する", async () => {
	const { plugin, contents, process } = fixture();
	const params = { paths: '["Note.md"]', moc: "MOC.md" };
	const preview = (await mocCliApi.run(plugin, params)) as {
		plan: string;
		blocked: boolean;
		links: unknown[];
	};
	expect(preview.blocked).toBe(false);
	expect(preview.links).toHaveLength(2);
	expect(process).not.toHaveBeenCalled();
	const result = await mocCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({
		files: [
			{ path: "MOC.md", result: "updated" },
			{ path: "Note.md", result: "updated" },
		],
	});
	expect(contents.get("MOC.md")).toContain("[[Note]]");
	expect(contents.get("Note.md")).toContain("[[MOC]]");
});

it("確認後に内容が変わると実行しない", async () => {
	const { plugin, contents, process } = fixture();
	const params = { paths: '["Note.md"]', moc: "MOC.md" };
	const preview = (await mocCliApi.run(plugin, params)) as { plan: string };
	contents.set("Note.md", "変更後");
	await expect(
		mocCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan }),
	).rejects.toThrow("計画が一致しません");
	expect(process).not.toHaveBeenCalled();
});

it("書き込みに失敗したリンクを成功と報告しない", async () => {
	const { plugin, process } = fixture();
	const params = { paths: '["Note.md"]', moc: "MOC.md" };
	const preview = (await mocCliApi.run(plugin, params)) as { plan: string };
	process.mockRejectedValueOnce(new Error("locked"));
	const result = await mocCliApi.run(plugin, { ...params, apply: "true", plan: preview.plan });
	expect(result).toMatchObject({
		links: expect.arrayContaining([
			expect.objectContaining({ from: "MOC.md", result: "failed", reason: "locked" }),
		]),
	});
});
