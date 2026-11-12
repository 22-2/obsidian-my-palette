import type { App, TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import { applyTagChangesToFiles } from "src/tags/tagOperations";

vi.mock("obsidian", () => ({
	parseFrontMatterTags: (frontmatter: { tags?: string[] }) => frontmatter?.tags ?? [],
}));

it("タグの追加と削除を各ノートに適用し、失敗しても続ける", async () => {
	const files = ["a.md", "b.md", "c.md"].map((path) => ({ path }) as TFile);
	const data: Record<string, Record<string, unknown>> = {
		"a.md": { tags: ["old", "keep"] },
		"b.md": { tags: ["old"] },
		"c.md": {},
	};
	const app = {
		metadataCache: { getFileCache: (file: TFile) => ({ frontmatter: data[file.path] }) },
		fileManager: {
			processFrontMatter: async (
				file: TFile,
				update: (value: Record<string, unknown>) => void,
			) => {
				if (file.path === "b.md") throw new Error("locked");
				update(data[file.path]);
			},
		},
	} as unknown as App;
	const results = await applyTagChangesToFiles(app, files, { add: ["new"], remove: ["old"] });
	expect(results).toEqual([
		{ path: "a.md", result: "updated" },
		{ path: "b.md", result: "failed" },
		{ path: "c.md", result: "updated" },
	]);
	expect(data["a.md"].tags).toEqual(["keep", "new"]);
	expect(data["c.md"].tags).toEqual(["new"]);
});
