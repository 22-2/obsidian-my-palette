import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { PropertyProvider } from "src/search/property/PropertyProvider";

const note = { path: "note.md", extension: "md" } as unknown as TFile;

function app(options: {
	frontmatter?: Record<string, unknown>;
	/** Per-note frontmatter, by path; falls back to `frontmatter`. */
	frontmatters?: Record<string, Record<string, unknown>>;
	vault?: Record<string, { type?: string; widget?: string }>;
	counts?: Record<string, number>;
	assigned?: Record<string, string>;
	file?: TFile | null;
}): App {
	return {
		workspace: { getActiveFile: () => options.file ?? null },
		metadataCache: {
			getFileCache: (file: TFile) => ({
				frontmatter: options.frontmatters?.[file.path] ?? options.frontmatter,
			}),
		},
		metadataTypeManager: {
			getAllProperties: () => options.vault ?? {},
			getPropertyOccurrences: () => options.counts ?? {},
			getAssignedWidget: (key: string) => options.assigned?.[key],
		},
	} as unknown as App;
}

describe("PropertyProvider", () => {
	it("reads vault properties without calling the deprecated metadata cache API", async () => {
		const application = app({ vault: { project: { widget: "number" } } });
		const deprecated = vi.fn(() => {
			throw new Error("Deprecated API called");
		});
		Object.assign(application.metadataCache, { getAllPropertyInfos: deprecated });
		const results = await new PropertyProvider(application).search({
			mode: "property",
			query: "",
			sourceFile: note,
		});
		expect(results.find((result) => result.key === "project")).toMatchObject({
			section: "Vault",
			kind: "number",
		});
		expect(deprecated).not.toHaveBeenCalled();
	});

	it("lists This note, then Reserved, then Vault keys by use", async () => {
		const provider = new PropertyProvider(
			app({
				frontmatter: { status: "done", position: {}, tags: ["a"] },
				vault: {
					status: {},
					project: {},
					area: {},
					rare: {},
				},
				counts: { status: 3, project: 9, area: 2, rare: 1 },
			}),
		);
		const results = await provider.search({ mode: "property", query: "", sourceFile: note });
		expect(results.map((r) => [r.section, r.primary])).toEqual([
			["This note", "status"],
			["Reserved", "aliases"],
			["Reserved", "tags"],
			["Reserved", "cssclasses"],
			["Vault", "project"],
			["Vault", "area"],
			["Vault", "rare"],
		]);
	});

	it("shows reserved keys that the note lacks as Not set, and vault counts", async () => {
		const provider = new PropertyProvider(
			app({
				frontmatter: {},
				vault: { project: {}, area: {} },
				counts: { project: 1, area: 4 },
			}),
		);
		const results = await provider.search({ mode: "property", query: "", sourceFile: note });
		const byKey = Object.fromEntries(results.map((r) => [r.primary, r]));
		expect(byKey.aliases).toMatchObject({ inNote: false, secondary: "Not set" });
		expect(byKey.area.secondary).toBe("4 notes");
		expect(byKey.project.secondary).toBe("1 note");
	});

	it("uses lowercase occurrence keys and counts each search only once", async () => {
		const application = app({ vault: { Project: {}, unused: {} } });
		const getPropertyOccurrences = vi.fn(() => ({ project: 12 }));
		Object.assign(application.metadataTypeManager, { getPropertyOccurrences });
		const results = await new PropertyProvider(application).search({
			mode: "property",
			query: "",
			sourceFile: note,
		});
		expect(
			results
				.filter((result) => result.section === "Vault")
				.map((result) => [result.key, result.secondary]),
		).toEqual([
			["Project", "12 notes"],
			["unused", "0 notes"],
		]);
		expect(getPropertyOccurrences).toHaveBeenCalledExactlyOnceWith();
	});

	it("uses the vault's assigned type and keeps the declared kind for note values", async () => {
		const provider = new PropertyProvider(
			app({
				frontmatter: { due: "2026-10-13", meta: { a: 1 } },
				assigned: { due: "datetime" },
			}),
		);
		const results = await provider.search({ mode: "property", query: "", sourceFile: note });
		expect(results.find((r) => r.primary === "due")).toMatchObject({ kind: "datetime" });
		expect(results.find((r) => r.primary === "meta")).toMatchObject({
			kind: "unsupported",
			secondary: "{…}",
		});
	});

	it("filters each section and keeps the section order", async () => {
		const provider = new PropertyProvider(
			app({
				frontmatter: { status: "done", statement: "x" },
				vault: { status: {}, stage: {} },
				counts: { status: 2, stage: 1 },
			}),
		);
		const results = await provider.search({ mode: "property", query: "sta", sourceFile: note });
		expect(results.map((r) => r.primary)).toEqual(
			expect.arrayContaining(["status", "statement", "stage"]),
		);
		expect(results.findIndex((r) => r.primary === "stage")).toBeGreaterThan(
			results.findIndex((r) => r.primary === "status"),
		);
		expect(results.some((r) => r.primary === "aliases")).toBe(false);
	});

	it("returns nothing when the current note is not Markdown", async () => {
		const provider = new PropertyProvider(
			app({ file: { path: "a.png", extension: "png" } as unknown as TFile }),
		);
		expect(await provider.search({ mode: "property", query: "" })).toEqual([]);
	});

	it("offers a new-key row last when nothing matches the typed key", async () => {
		const provider = new PropertyProvider(
			app({
				frontmatter: { status: "done" },
				vault: { project: {} },
				counts: { project: 2 },
			}),
		);
		const results = await provider.search({
			mode: "property",
			query: "budget",
			sourceFile: note,
		});
		expect(results).toHaveLength(1);
		expect(results[0]).toMatchObject({
			kind: "new",
			section: "New",
			key: "budget",
			inNote: false,
		});
	});

	it("does not offer a new key while an existing key matches", async () => {
		const provider = new PropertyProvider(app({ frontmatter: { status: "done" } }));
		const results = await provider.search({
			mode: "property",
			query: "stat",
			sourceFile: note,
		});
		expect(results.some((result) => result.kind === "new")).toBe(false);
	});

	it("does not offer a new key for an empty input", async () => {
		const provider = new PropertyProvider(app({ frontmatter: {} }));
		const results = await provider.search({ mode: "property", query: "  ", sourceFile: note });
		expect(results.some((result) => result.kind === "new")).toBe(false);
	});

	describe("several notes", () => {
		const second = { path: "second.md", extension: "md" } as unknown as TFile;
		const third = { path: "third.md", extension: "md" } as unknown as TFile;
		const frontmatters = {
			"note.md": { status: "done", topic: ["a"], tags: ["x"] },
			"second.md": { status: "todo", rating: 3 },
			"third.md": { status: "todo", topic: ["b"], position: {} },
		};

		it("lists the keys of all notes, most shared first, each editing every note", async () => {
			const provider = new PropertyProvider(
				app({ frontmatters, vault: { project: {} }, counts: { project: 4 } }),
			);
			const results = await provider.search({
				mode: "property",
				query: "",
				sourceFiles: [note, second, third],
			});
			expect(results.map((r) => [r.section, r.primary, r.secondary])).toEqual([
				["These notes", "status", "3/3 notes"],
				["These notes", "topic", "2/3 notes"],
				["These notes", "rating", "1/3 notes"],
				["Reserved", "aliases", "Not set"],
				["Reserved", "tags", "1/3 notes"],
				["Reserved", "cssclasses", "Not set"],
				["Vault", "project", "4 notes"],
			]);
			expect(results.every((r) => r.sourcePaths?.length === 3)).toBe(true);
			expect(results[0].sourcePath).toBe("note.md");
			expect(results.find((r) => r.key === "topic")).toMatchObject({ kind: "list" });
		});

		it("offers a new key for all the notes", async () => {
			const provider = new PropertyProvider(app({ frontmatters }));
			const [row] = await provider.search({
				mode: "property",
				query: "zzz",
				sourceFiles: [note, second],
			});
			expect(row).toMatchObject({ kind: "new", sourcePaths: ["note.md", "second.md"] });
		});

		it("keeps a single note's rows free of the multi-note fields", async () => {
			const provider = new PropertyProvider(app({ frontmatters }));
			const results = await provider.search({
				mode: "property",
				query: "",
				sourceFiles: [note],
			});
			expect(results[0]).toMatchObject({ section: "This note", primary: "status" });
			expect(results.every((r) => r.sourcePaths === undefined)).toBe(true);
		});
	});
});
