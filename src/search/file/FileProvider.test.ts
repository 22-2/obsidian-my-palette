import { beforeEach, describe, expect, it, vi } from "vitest";
import type { App, EventRef, TFile } from "obsidian";
import { FileProvider } from "src/search/file/FileProvider";

vi.mock("obsidian", () => ({
	parseFrontMatterTags: () => [],
	normalizePath: (path: string) => path,
}));

function tfile(path: string, mtime = 1): TFile {
	const basename = path.split("/").pop()?.replace(/\.md$/, "") ?? path;
	return { path, basename, extension: "md", stat: { mtime } } as unknown as TFile;
}

describe("file provider vault event handling", () => {
	const vaultHandlers = new Map<string, (...args: never[]) => unknown>();
	const metadataHandlers = new Map<string, (...args: never[]) => unknown>();
	let files: TFile[];
	let frontmatter: Record<string, unknown>;

	beforeEach(() => {
		vaultHandlers.clear();
		metadataHandlers.clear();
		files = [tfile("untitled.md")];
		frontmatter = {};
	});

	function createProvider(): FileProvider {
		const app = {
			vault: {
				getFiles: () => [...files],
				getAbstractFileByPath: (path: string) =>
					files.find((file) => file.path === path) ?? null,
				on: (name: string, callback: (...args: never[]) => unknown): EventRef => {
					vaultHandlers.set(name, callback);
					return {} as EventRef;
				},
				offref: () => undefined,
				getConfig: () => undefined,
				getName: () => "test-vault",
				adapter: {},
			},
			metadataCache: {
				on: (name: string, callback: (...args: never[]) => unknown): EventRef => {
					metadataHandlers.set(name, callback);
					return {} as EventRef;
				},
				offref: () => undefined,
				getFileCache: () => ({ frontmatter }),
			},
			workspace: {
				getLastOpenFiles: () => [],
			},
		} as unknown as App;
		return new FileProvider(app, () => []);
	}

	it("searches keywords and refreshes matching evidence after property edits", async () => {
		frontmatter = { keywords: ["宇宙", "星空観察"] };
		const provider = createProvider();
		const request = { query: "宇宙 星空", mode: "file" as const };
		expect(await provider.search(request)).toMatchObject([
			{
				vaultPath: "untitled.md",
				primary: "untitled",
				matchedKeywords: ["宇宙", "星空観察"],
			},
		]);
		expect(await provider.search({ ...request, query: "" })).toMatchObject([
			{ matchedKeywords: undefined },
		]);
		frontmatter = { keywords: ["読書"] };
		metadataHandlers.get("changed")?.(files[0] as never);
		expect(await provider.search(request)).toHaveLength(0);
		expect(await provider.search({ ...request, query: "読書" })).toMatchObject([
			{ matchedKeywords: ["読書"] },
		]);
		provider.dispose();
	});

	it("finds the file by its new name after a vault rename event", async () => {
		const provider = createProvider();
		expect(
			await provider.search({ query: "ungaki-", includeIgnored: false, mode: "file" }),
		).toHaveLength(0);

		const renamed = tfile("ungaki-test.md", 2);
		files = [renamed];
		vaultHandlers.get("rename")?.(renamed as never, "untitled.md" as never);

		const results = await provider.search({
			query: "ungaki-",
			includeIgnored: false,
			mode: "file",
		});
		expect(results.map((result) => result.vaultPath)).toContain("ungaki-test.md");
		expect(
			await provider.search({ query: "untitled", includeIgnored: false, mode: "file" }),
		).toHaveLength(0);
		provider.dispose();
	});

	it("keeps the renamed entry when metadataCache deleted fires for an existing path", async () => {
		const provider = createProvider();
		const renamed = tfile("ungaki-test.md", 2);
		files = [renamed];
		vaultHandlers.get("rename")?.(renamed as never, "untitled.md" as never);
		// Rename bookkeeping may surface as a spurious `deleted` for the new path.
		metadataHandlers.get("deleted")?.(renamed as never, null as never);

		const results = await provider.search({
			query: "ungaki-",
			includeIgnored: false,
			mode: "file",
		});
		expect(results.map((result) => result.vaultPath)).toContain("ungaki-test.md");
		provider.dispose();
	});

	it("drops the entry when the deleted path is actually gone from the vault", async () => {
		const provider = createProvider();
		const target = tfile("untitled.md");
		files = [];
		vaultHandlers.get("delete")?.(target as never);
		metadataHandlers.get("deleted")?.(target as never, null as never);

		expect(
			await provider.search({ query: "untitled", includeIgnored: false, mode: "file" }),
		).toHaveLength(0);
		provider.dispose();
	});
});
