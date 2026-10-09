import { describe, expect, it, vi } from "vitest";
import { TFile, type App, type LinkCache } from "obsidian";
import { RelatedFileProvider } from "src/search/related/RelatedFileProvider";

vi.mock("obsidian", () => ({
	TFile: class {},
}));

function tfile(path: string): TFile {
	return Object.assign(new TFile(), {
		path,
		basename: path.split("/").pop()?.replace(/\.md$/, "") ?? path,
	});
}

function link(linkpath: string, line: number, offset = line * 100): LinkCache {
	return {
		link: linkpath,
		original: `[[${linkpath}]]`,
		position: {
			start: { line, col: 0, offset },
			end: { line, col: linkpath.length + 4, offset: offset + linkpath.length + 4 },
		},
	};
}

function fixture() {
	const origin = tfile("Hub.md");
	const target = tfile("Topics/Target.md");
	const other = tfile("Other/Target.md");
	const links = [
		link("Target", 0),
		link("Topics/Target", 0, 30),
		link("Target#Details", 1),
		link("Topics/Target#^block", 2),
		link("Other/Target", 3),
	];
	const content = [
		"[[Target]] and [[Topics/Target|alias]]",
		"needle [[Target#Details]]",
		"[[Topics/Target#^block]]",
		"[[Other/Target]]",
	].join("\n");
	const app = {
		workspace: { getActiveFile: () => origin },
		metadataCache: {
			getFileCache: () => ({ links }),
			getFirstLinkpathDest: (path: string) => (path === "Other/Target" ? other : target),
			getBacklinksForFile: () => ({ data: new Map([[origin.path, links.slice(0, 4)]]) }),
		},
		vault: {
			cachedRead: vi.fn(async () => content),
			getAbstractFileByPath: () => origin,
		},
	} as unknown as App;
	return { app, origin, target, other, provider: new RelatedFileProvider(app) };
}

describe("RelatedFileProvider outgoing deduplication", () => {
	it("lists each resolved destination once, including repeated, aliased and subpath links", async () => {
		const { provider, target, other, app } = fixture();
		const results = await provider.search({ mode: "link", query: "" });
		expect(results.map(({ file }) => file.path)).toEqual([other.path, target.path]);
		expect(results.find(({ file }) => file.path === target.path)?.line).toBe(0);
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(1);
	});

	it("deduplicates queried destinations without hiding matches in later occurrences", async () => {
		const { provider, target } = fixture();
		const byName = await provider.search({ mode: "link", query: "Target" });
		expect(byName).toHaveLength(2);
		expect(byName.filter(({ file }) => file.path === target.path)).toHaveLength(1);
		const byContext = await provider.search({ mode: "link", query: "needle" });
		expect(byContext).toHaveLength(1);
		expect(byContext[0]).toMatchObject({ file: target, line: 1 });
	});

	it("preserves individual backlink occurrences", async () => {
		const { provider, origin } = fixture();
		const results = await provider.search({ mode: "backlink", query: "" });
		expect(results).toHaveLength(4);
		expect(results.every(({ file }) => file.path === origin.path)).toBe(true);
	});
});
