import { describe, expect, it } from "vitest";
import type { App, HeadingCache, TFile } from "obsidian";
import { HeadingProvider } from "src/search/heading/HeadingProvider";

function tfile(path: string): TFile {
	return { path, basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path } as TFile;
}

function heading(text: string, level: number, line: number): HeadingCache {
	return {
		heading: text,
		level,
		position: {
			start: { line, col: 0, offset: line * 10 },
			end: { line, col: text.length, offset: line * 10 + text.length },
		},
	};
}

function fixture(headingsByPath: Record<string, HeadingCache[]>, active?: TFile) {
	const app = {
		workspace: { getActiveFile: () => active ?? null },
		metadataCache: {
			getFileCache: (file: TFile) =>
				file.path in headingsByPath ? { headings: headingsByPath[file.path] } : null,
		},
	} as unknown as App;
	return new HeadingProvider(app);
}

describe("見出しプロバイダー", () => {
	it("見出しを文書の順に、深さと行の情報付きでリストします", async () => {
		const note = tfile("Plan.md");
		const provider = fixture(
			{
				"Plan.md": [
					heading("Overview", 1, 0),
					heading("Details", 2, 4),
					heading("Next", 3, 9),
				],
			},
			note,
		);

		const results = await provider.search({ mode: "heading", query: "" });

		expect(results.map(({ primary, level, line }) => ({ primary, level, line }))).toEqual([
			{ primary: "Overview", level: 1, line: 0 },
			{ primary: "Details", level: 2, line: 4 },
			{ primary: "Next", level: 3, line: 9 },
		]);
		expect(results[1]).toMatchObject({ mode: "heading", file: note, secondary: "5 行目" });
	});

	it("クエリで見出しの文字列を絞り込みます", async () => {
		const provider = fixture(
			{ "Plan.md": [heading("Overview", 1, 0), heading("Details", 2, 4)] },
			tfile("Plan.md"),
		);

		const results = await provider.search({ mode: "heading", query: "detail" });

		expect(results.map(({ primary }) => primary)).toEqual(["Details"]);
	});

	it("元のノートが指定されていればアクティブなノートより優先します", async () => {
		const source = tfile("Source.md");
		const provider = fixture(
			{
				"Source.md": [heading("From source", 1, 0)],
				"Active.md": [heading("From active", 1, 0)],
			},
			tfile("Active.md"),
		);

		const results = await provider.search({
			mode: "heading",
			query: "",
			sourceFile: source,
		});

		expect(results.map(({ primary }) => primary)).toEqual(["From source"]);
	});

	it("ノートがないとき、または見出しがないときは空の一覧を返します", async () => {
		const provider = fixture({ "Plain.md": [] }, tfile("Plain.md"));

		expect(await provider.search({ mode: "heading", query: "" })).toEqual([]);
		expect(await fixture({}).search({ mode: "heading", query: "" })).toEqual([]);
	});

	it("見出しを扱わないモードでは例外を投げます", async () => {
		const provider = fixture({}, tfile("Plan.md"));

		await expect(provider.search({ mode: "link", query: "" })).rejects.toThrow(
			"HeadingProvider cannot search mode: link",
		);
	});
});
