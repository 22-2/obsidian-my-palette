import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { TagProvider } from "src/search/tag/TagProvider";

function providerWith(tags: Record<string, number>) {
	const app = { metadataCache: { getTags: () => tags } } as unknown as App;
	return new TagProvider(app);
}

describe("タグプロバイダー", () => {
	it("使用法ごとにタグをリストし、ハッシュまたは大文字小文字のみが異なるカウントをマージします", async () => {
		const rows = await providerWith({ "#Old": 2, "#old": 1, "#keep": 5 }).search({
			mode: "tag",
			query: "",
		});
		expect(rows.map((row) => [row.primary, row.count])).toEqual([
			["#keep", 5],
			["#Old", 3],
		]);
		expect(rows[1]).toMatchObject({ mode: "tag", tagName: "Old" });
	});

	it("クエリの入力時にタグ名で検索します", async () => {
		const rows = await providerWith({ "#project": 2, "#work": 4 }).search({
			mode: "tag",
			query: "proj",
		});
		expect(rows.map((row) => row.primary)).toEqual(["#project"]);
	});
});
