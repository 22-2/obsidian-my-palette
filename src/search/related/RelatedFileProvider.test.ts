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
			getBacklinksForFile: () => ({
				data: new Map([
					[origin.path, links.slice(0, 4)],
					[other.path, [link("Target", 0), link("Target#Details", 1)]],
				]),
			}),
		},
		vault: {
			cachedRead: vi.fn(async (file: TFile) =>
				file === other ? "[[Target]]\n[[Target#Details]]" : content,
			),
			getAbstractFileByPath: (path: string) =>
				[origin, target, other].find((file) => file.path === path) ?? null,
		},
	} as unknown as App;
	return { app, origin, target, other, provider: new RelatedFileProvider(app) };
}

describe("RelatedFileProvider deduplication", () => {
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

	it("lists each backlink source once and reads each source note once", async () => {
		const { provider, origin, target, other, app } = fixture();
		const results = await provider.search({ mode: "backlink", query: "", sourceFile: target });
		expect(results.map(({ file }) => file.path)).toEqual([origin.path, other.path]);
		expect(results.map(({ line }) => line)).toEqual([0, 0]);
		expect(app.vault.cachedRead).toHaveBeenCalledTimes(2);
	});

	it("deduplicates queried backlinks without hiding matches in later occurrences", async () => {
		const { provider, origin, target } = fixture();
		const request = { mode: "backlink" as const, sourceFile: target };
		const byContext = await provider.search({ ...request, query: "Target" });
		expect(byContext).toHaveLength(2);
		expect(byContext.filter(({ file }) => file.path === origin.path)).toHaveLength(1);
		const laterContext = await provider.search({ ...request, query: "needle" });
		expect(laterContext).toHaveLength(1);
		expect(laterContext[0]).toMatchObject({ file: origin, line: 1 });
	});
});
