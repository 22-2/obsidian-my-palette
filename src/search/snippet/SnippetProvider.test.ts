import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { SnippetProvider } from "src/search/snippet/SnippetProvider";

vi.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
	normalizePath: (path: string) => path,
}));

function app(): App {
	return {
		customCss: {
			snippets: ["beta.css", "alpha.css"],
			enabledSnippets: new Set(["alpha.css"]),
			getSnippetsFolder: () => "cfg/snippets",
			getSnippetPath: (snippet: string) => `cfg/snippets/${snippet}`,
		},
		vault: {
			adapter: {
				getFullPath: (vaultPath: string) => `C:/vault/${vaultPath}`,
			},
		},
	} as unknown as App;
}

describe("SnippetProvider", () => {
	it("lists the folder first, then snippets by name with availability", async () => {
		const results = await new SnippetProvider(app()).search({
			mode: "snippet",
			query: "",
		});
		expect(results.map((result) => result.id)).toEqual([
			"snippet:folder",
			"snippet:alpha.css",
			"snippet:beta.css",
		]);
		expect(results[0]).toMatchObject({
			primary: "スニペットのフォルダー",
			isFolder: true,
			absolutePath: "C:/vault/cfg/snippets",
		});
		expect(results[1]).toMatchObject({
			primary: "alpha",
			secondary: "有効",
			isFolder: false,
		});
		expect(results[2]).toMatchObject({ primary: "beta", secondary: "無効" });
	});

	it("searches snippets only, without the folder row", async () => {
		const provider = new SnippetProvider(app());
		expect(
			(await provider.search({ mode: "snippet", query: "alp" })).map((result) => result.id),
		).toEqual(["snippet:alpha.css"]);
		expect(await provider.search({ mode: "snippet", query: "folder" })).toEqual([]);
	});
});
