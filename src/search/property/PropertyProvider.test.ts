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

describe("プロパティプロバイダー", () => {
	it("非推奨のメタデータ キャッシュ API を呼び出さずに Vault プロパティを読み取ります。", async () => {
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

	it("「このメモ」、「予約済み」、「使用別の Vault キー」の順にリストします。", async () => {
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
			["このノート", "status"],
			["予約済み", "aliases"],
			["予約済み", "tags"],
			["予約済み", "cssclasses"],
			["Vault", "project"],
			["Vault", "area"],
			["Vault", "rare"],
		]);
	});

	it("ノートに不足している予約キーが「未設定」として表示され、ボールト数が表示されます。", async () => {
		const provider = new PropertyProvider(
			app({
				frontmatter: {},
				vault: { project: {}, area: {} },
				counts: { project: 1, area: 4 },
			}),
		);
		const results = await provider.search({ mode: "property", query: "", sourceFile: note });
		const byKey = Object.fromEntries(results.map((r) => [r.primary, r]));
		expect(byKey.aliases).toMatchObject({ inNote: false, secondary: "未設定" });
		expect(byKey.area.secondary).toBe("4 件のノート");
		expect(byKey.project.secondary).toBe("1 件のノート");
	});

	it("小文字の出現キーを使用し、各検索を 1 回だけカウントします", async () => {
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
			["Project", "12 件のノート"],
			["unused", "0 件のノート"],
		]);
		expect(getPropertyOccurrences).toHaveBeenCalledExactlyOnceWith();
	});

	it("Vault に割り当てられたタイプを使用し、メモ値の宣言された種類を保持します。", async () => {
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

	it("各セクションをフィルタリングし、セクションの順序を維持します", async () => {
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

	it("現在のノートが Markdown でない場合は何も返しません。", async () => {
		const provider = new PropertyProvider(
			app({ file: { path: "a.png", extension: "png" } as unknown as TFile }),
		);
		expect(await provider.search({ mode: "property", query: "" })).toEqual([]);
	});

	it("入力されたキーに一致するものがない場合に、最後に新しいキー行を提供します", async () => {
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
			section: "新規",
			key: "budget",
			inNote: false,
		});
	});

	it("既存のキーが一致する間は新しいキーを提供しません", async () => {
		const provider = new PropertyProvider(app({ frontmatter: { status: "done" } }));
		const results = await provider.search({
			mode: "property",
			query: "stat",
			sourceFile: note,
		});
		expect(results.some((result) => result.kind === "new")).toBe(false);
	});

	it("空の入力に対して新しいキーは提供されません", async () => {
		const provider = new PropertyProvider(app({ frontmatter: {} }));
		const results = await provider.search({ mode: "property", query: "  ", sourceFile: note });
		expect(results.some((result) => result.kind === "new")).toBe(false);
	});

	describe("いくつかのメモ", () => {
		const second = { path: "second.md", extension: "md" } as unknown as TFile;
		const third = { path: "third.md", extension: "md" } as unknown as TFile;
		const frontmatters = {
			"note.md": { status: "done", topic: ["a"], tags: ["x"] },
			"second.md": { status: "todo", rating: 3 },
			"third.md": { status: "todo", topic: ["b"], position: {} },
		};

		it("すべてのノートのキーをリストします。最も共有されているものから順に、各ノートが編集されます。", async () => {
			const provider = new PropertyProvider(
				app({ frontmatters, vault: { project: {} }, counts: { project: 4 } }),
			);
			const results = await provider.search({
				mode: "property",
				query: "",
				sourceFiles: [note, second, third],
			});
			expect(results.map((r) => [r.section, r.primary, r.secondary])).toEqual([
				["これらのノート", "status", "3/3 件のノート"],
				["これらのノート", "topic", "2/3 件のノート"],
				["これらのノート", "rating", "1/3 件のノート"],
				["予約済み", "aliases", "未設定"],
				["予約済み", "tags", "1/3 件のノート"],
				["予約済み", "cssclasses", "未設定"],
				["Vault", "project", "4 件のノート"],
			]);
			expect(results.every((r) => r.sourcePaths?.length === 3)).toBe(true);
			expect(results[0].sourcePath).toBe("note.md");
			expect(results.find((r) => r.key === "topic")).toMatchObject({ kind: "list" });
		});

		it("すべての音符に新しいキーを提供します", async () => {
			const provider = new PropertyProvider(app({ frontmatters }));
			const [row] = await provider.search({
				mode: "property",
				query: "zzz",
				sourceFiles: [note, second],
			});
			expect(row).toMatchObject({ kind: "new", sourcePaths: ["note.md", "second.md"] });
		});

		it("単一のノートの行を複数のノートのフィールドから解放します。", async () => {
			const provider = new PropertyProvider(app({ frontmatters }));
			const results = await provider.search({
				mode: "property",
				query: "",
				sourceFiles: [note],
			});
			expect(results[0]).toMatchObject({ section: "このノート", primary: "status" });
			expect(results.every((r) => r.sourcePaths === undefined)).toBe(true);
		});
	});
});
