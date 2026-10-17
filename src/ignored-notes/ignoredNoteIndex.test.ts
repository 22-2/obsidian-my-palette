import { beforeEach, describe, expect, it, vi } from "vitest";

// The fake store only reads the key and vault id; the rest of each row is passed through.
type StoredRow = { key: string; vaultId: string };

const databaseState = vi.hoisted(() => ({
	rows: new Map<string, StoredRow>(),
	meta: new Map<string, unknown>(),
}));
const scanState = vi.hoisted(() => ({ filters: ["Excluded"], paths: ["Excluded/note.md"] }));

vi.mock("idb", () => ({
	openDB: vi.fn(
		async (_name: string, _version: number, options: { upgrade: (db: unknown) => void }) => {
			const db = {
				objectStoreNames: { contains: () => false },
				createObjectStore: () => ({ createIndex: vi.fn() }),
				getAllFromIndex: async (_store: string, _index: string, vaultId: string) =>
					[...databaseState.rows.values()].filter((row) => row.vaultId === vaultId),
				get: async (_store: string, key: string) => databaseState.meta.get(key),
				put: async (_store: string, value: unknown, key: string) => {
					databaseState.meta.set(key, value);
				},
				transaction: () => {
					const store = {
						index: () => ({
							getAll: async (vaultId: string) =>
								[...databaseState.rows.values()].filter(
									(row) => row.vaultId === vaultId,
								),
						}),
						delete: async (key: string) => {
							databaseState.rows.delete(key);
						},
						put: async (row: StoredRow) => {
							databaseState.rows.set(row.key, row);
						},
					};
					return { store, done: Promise.resolve() };
				},
				close: vi.fn(),
			};
			options.upgrade(db);
			return db;
		},
	),
}));
vi.mock("src/ignored-notes/ignoredPaths", () => ({
	getUserIgnoreFilters: () => scanState.filters,
	isUserIgnoreFilterRegex: (filter: string) => filter.startsWith("/") && filter.endsWith("/"),
	isUserIgnoredPathWithFilters: (filters: string[], path: string) =>
		filters.some((filter) => path.startsWith(filter)),
}));
vi.mock("src/ignored-notes/ignoredNoteScanner", () => ({
	collectVaultPaths: vi.fn(async (_app: unknown, _roots: string[]) => scanState.paths),
	mapWithConcurrency: async <T, R>(
		items: T[],
		_concurrency: number,
		callback: (item: T) => Promise<R>,
	) => Promise.all(items.map(callback)),
}));
vi.mock("src/ignored-notes/ignoredNoteEntry", () => ({
	parseIgnoredNoteFrontmatter: () => ({
		aliases: ["Alias"],
		keywords: ["keyword"],
		tags: ["tag"],
		prior: 2,
	}),
}));

import { IgnoredNoteIndex } from "src/ignored-notes/ignoredNoteIndex";

beforeEach(() => {
	databaseState.rows.clear();
	databaseState.meta.clear();
	scanState.filters = ["Excluded"];
	scanState.paths = ["Excluded/note.md"];
});

function makeApp() {
	const read = vi.fn(async () => "---\naliases: [Alias]\n---\nBody");
	const stat = vi.fn(async (path: string) =>
		path.includes("missing") ? null : { mtime: 10, size: 20, type: "file" },
	);
	const app = {
		vault: {
			getName: () => "Vault",
			getConfig: () => scanState.filters,
			adapter: { getBasePath: () => "C:\\Vault", stat, read },
		},
	};
	return { app: app as never, read, stat };
}

describe("IgnoredNoteIndex", () => {
	it("scans ignored files, persists metadata, and reuses a fresh cached index", async () => {
		const { app, read } = makeApp();
		const first = new IgnoredNoteIndex(app);
		const entries = await first.getEntries();
		expect(entries).toMatchObject([
			{
				path: "Excluded/note.md",
				basename: "note",
				extension: "md",
				aliases: ["Alias"],
				prior: 2,
			},
		]);
		expect(read).toHaveBeenCalledOnce();
		await first.dispose();

		const second = new IgnoredNoteIndex(app);
		expect(await second.getEntries()).toEqual(entries);
		await second.dispose();
	});

	it("rebuilds after filter changes, removes stale paths, and retains cached entries on read errors", async () => {
		const { app, stat } = makeApp();
		const index = new IgnoredNoteIndex(app);
		await index.getEntries();
		stat.mockRejectedValueOnce(new Error("locked"));
		scanState.filters = ["Excluded", "/^Hidden/"];
		scanState.paths = ["Excluded/note.md", "Hidden/locked.md", "Excluded/missing.md"];
		const entries = await index.getEntries();
		expect(entries.map(({ path }) => path)).toEqual(["Excluded/note.md"]);
		await index.dispose();
	});

	it("handles empty filter scans and repeated rebuild calls", async () => {
		const { app } = makeApp();
		scanState.filters = [];
		scanState.paths = [];
		const index = new IgnoredNoteIndex(app);
		await Promise.all([index.rebuild(), index.rebuild()]);
		expect(await index.getEntries()).toEqual([]);
		await index.dispose();
	});
});
