import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { PropertyProvider } from "src/search/property/PropertyProvider";

const note = { path: "note.md", extension: "md" } as unknown as TFile;

function app(options: {
	frontmatter?: Record<string, unknown>;
	vault?: Record<string, { type?: string; widget?: string; count?: number }>;
	assigned?: Record<string, string>;
	file?: TFile | null;
}): App {
	return {
		workspace: { getActiveFile: () => options.file ?? null },
		metadataCache: {
			getFileCache: () => ({ frontmatter: options.frontmatter }),
		},
		metadataTypeManager: {
			getAllProperties: () => options.vault ?? {},
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
					status: { count: 3 },
					project: { count: 9 },
					area: { count: 2 },
					rare: { count: 1 },
				},
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
			app({ frontmatter: {}, vault: { project: { count: 1 }, area: { count: 4 } } }),
		);
		const results = await provider.search({ mode: "property", query: "", sourceFile: note });
		const byKey = Object.fromEntries(results.map((r) => [r.primary, r]));
		expect(byKey.aliases).toMatchObject({ inNote: false, secondary: "Not set" });
		expect(byKey.area.secondary).toBe("4 notes");
		expect(byKey.project.secondary).toBe("1 note");
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
				vault: { status: { count: 2 }, stage: { count: 1 } },
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
			app({ frontmatter: { status: "done" }, vault: { project: { count: 2 } } }),
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
});
