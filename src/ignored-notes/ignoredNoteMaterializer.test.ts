import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => {
	class MockTFile {
		path: string;

		constructor(path: string) {
			this.path = path;
		}
	}

	return {
		TFile: MockTFile,
		normalizePath: (value: string) => value.replace(/\\/g, "/"),
		getFrontMatterInfo: (content: string) => {
			const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
			return {
				exists: Boolean(match),
				frontmatter: match?.[1] ?? "",
				from: 0,
				to: match?.[0].length ?? 0,
			};
		},
		parseYaml: (frontmatter: string) =>
			Object.fromEntries(
				frontmatter.split(/\r?\n/).flatMap((line) => {
					const separator = line.indexOf(":");
					if (separator < 0) return [];
					const key = line.slice(0, separator).trim();
					const rawValue = line.slice(separator + 1).trim();
					try {
						return [[key, JSON.parse(rawValue)]];
					} catch {
						return [[key, rawValue]];
					}
				}),
			),
		parseFrontMatterEntry: (parsed: Record<string, unknown>, key: string) => parsed[key],
	};
});

import { TFile, type App } from "obsidian";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";

interface FakeVault {
	getConfig(key: string): unknown;
	adapter: {
		read(path: string): Promise<string>;
		stat(
			path: string,
		): Promise<{ type: "file" | "folder"; mtime: number; size: number } | null>;
	};
	getAbstractFileByPath(path: string): TFile | object | null;
	getFolderByPath(path: string): object | undefined;
	createFolder(path: string): Promise<void>;
	create(path: string, content: string): Promise<TFile>;
	read(file: TFile): Promise<string>;
}

interface FakeVaultState {
	app: App;
	contents: Map<string, string>;
	files: Map<string, TFile>;
	folders: Set<string>;
	createCount: number;
}

function createTestFile(path: string): TFile {
	return Object.assign(new TFile(), { path });
}

function createFakeVault(sourcePath: string, sourceContent: string): FakeVaultState {
	const contents = new Map([[sourcePath, sourceContent]]);
	const files = new Map<string, TFile>();
	const folders = new Set<string>();
	let createCount = 0;
	const vault: FakeVault = {
		getConfig: (key) =>
			key === "userIgnoreFilters" ? ["ignored", "/\\.private\\//"] : "Imported",
		adapter: {
			read: async (path) => contents.get(path) ?? "",
			stat: async (path) => {
				if (files.has(path))
					return { type: "file", mtime: 1, size: contents.get(path)?.length ?? 0 };
				if (folders.has(path)) return { type: "folder", mtime: 1, size: 0 };
				return null;
			},
		},
		getAbstractFileByPath: (path) => files.get(path) ?? (folders.has(path) ? {} : null),
		getFolderByPath: (path) => (folders.has(path) ? {} : undefined),
		createFolder: async (path) => {
			folders.add(path);
		},
		create: async (path, content) => {
			const file = createTestFile(path);
			files.set(path, file);
			contents.set(path, content);
			createCount += 1;
			return file;
		},
		read: async (file) => contents.get(file.path) ?? "",
	};
	return {
		app: { vault } as unknown as App,
		contents,
		files,
		folders,
		get createCount() {
			return createCount;
		},
	};
}

function addExistingFile(state: FakeVaultState, path: string, content: string): void {
	const file = createTestFile(path);
	state.files.set(path, file);
	state.contents.set(path, content);
}

describe("materializeIgnoredNote", () => {
	const log = vi.fn<(message: string, detail?: unknown) => void>();

	beforeEach(() => {
		log.mockClear();
	});

	it("creates an imported note directly under the configured folder", async () => {
		const state = createFakeVault("ignored/note.md", "# Note");

		const imported = await materializeIgnoredNote(state.app, "ignored/note.md", log);

		expect(imported.path).toBe("Imported/note.md");
		expect(state.contents.get(imported.path)).toMatch(
			/^---\nmy-palette-source: "ignored\/note\.md"\nmy-palette-imported-at: ".+"\n---\n# Note$/,
		);
		expect(log).toHaveBeenCalledWith(
			"Imported ignored note",
			expect.objectContaining({
				sourcePath: "ignored/note.md",
				destinationPath: "Imported/note.md",
			}),
		);
	});

	it("reuses an existing import for the same source", async () => {
		const state = createFakeVault("ignored/note.md", "# Note");

		const first = await materializeIgnoredNote(state.app, "ignored/note.md", log);
		const second = await materializeIgnoredNote(state.app, "ignored/note.md", log);

		expect(second).toBe(first);
		expect(state.createCount).toBe(1);
	});

	it("uses a deterministic suffix for a flattened collision", async () => {
		const state = createFakeVault(".private/note.md", "# Private");
		addExistingFile(
			state,
			"Imported/note.md",
			'---\nmy-palette-source: "other/note.md"\n---\n# Other',
		);

		const imported = await materializeIgnoredNote(state.app, ".private/note.md", log);

		expect(imported.path).toBe("Imported/note (imported 1).md");
	});
});
