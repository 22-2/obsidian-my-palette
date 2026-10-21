import type { App } from "obsidian";
import { describe, expect, it } from "vitest";
import { TagProvider } from "src/search/tag/TagProvider";

function providerWith(tags: Record<string, number>) {
	const app = { metadataCache: { getTags: () => tags } } as unknown as App;
	return new TagProvider(app);
}

describe("TagProvider", () => {
	it("lists tags by usage and merges counts that differ only by hash or case", async () => {
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

	it("searches by tag name when a query is typed", async () => {
		const rows = await providerWith({ "#project": 2, "#work": 4 }).search({
			mode: "tag",
			query: "proj",
		});
		expect(rows.map((row) => row.primary)).toEqual(["#project"]);
	});
});
