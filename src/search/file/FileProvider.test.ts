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

	function createProvider(openableFilesOnly = false): FileProvider {
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
			viewRegistry: {
				isExtensionRegistered: (extension: string) => extension === "md",
			},
		} as unknown as App;
		// 引数は既定値のままにし、最後の引数だけでオプションを渡す。
		return new FileProvider(
			app,
			() => [],
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			() => openableFilesOnly,
		);
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

	it("lists what remains in the empty-query order for a query with only exclusions", async () => {
		files = [tfile("notes/alpha.md", 1), tfile("archive/beta.md", 3), tfile("gamma.md", 2)];
		const provider = createProvider();
		const request = { includeIgnored: false, mode: "file" as const };
		const blank = (await provider.search({ ...request, query: "" })).map(
			({ vaultPath }) => vaultPath,
		);
		expect(
			(await provider.search({ ...request, query: "!archive" })).map(
				({ vaultPath }) => vaultPath,
			),
		).toEqual(blank.filter((path) => !path.startsWith("archive/")));
		provider.dispose();
	});

	it("hides files Obsidian cannot open only when the openable filter is on", async () => {
		files = [
			tfile("note.md"),
			{
				path: "config.toml",
				basename: "config",
				extension: "toml",
				stat: { mtime: 1 },
			} as unknown as TFile,
		];
		const request = { query: "", includeIgnored: false, mode: "file" as const };
		const visiblePaths = async (openableFilesOnly: boolean): Promise<string[]> => {
			const provider = createProvider(openableFilesOnly);
			const paths = (await provider.search(request)).map(({ vaultPath }) => vaultPath);
			provider.dispose();
			return paths;
		};
		expect(await visiblePaths(false)).toEqual(["note.md", "config.toml"].sort());
		expect(await visiblePaths(true)).toEqual(["note.md"]);
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
