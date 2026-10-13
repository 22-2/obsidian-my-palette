import type { App, TFile } from "obsidian";
import { describe, expect, it } from "vitest";
import { PropertyProvider } from "src/search/property/PropertyProvider";

const note = { path: "note.md", extension: "md" } as unknown as TFile;

function app(options: {
	frontmatter?: Record<string, unknown>;
	vault?: Record<string, { type?: string; count?: number }>;
	assigned?: Record<string, string>;
	file?: TFile | null;
}): App {
	return {
		workspace: { getActiveFile: () => options.file ?? null },
		metadataCache: {
			getFileCache: () => ({ frontmatter: options.frontmatter }),
			getAllPropertyInfos: () => options.vault ?? {},
		},
		metadataTypeManager: {
			getAssignedWidget: (key: string) => options.assigned?.[key],
		},
	} as unknown as App;
}

describe("PropertyProvider", () => {
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
});
