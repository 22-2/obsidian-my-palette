import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import { populatePropertyMenu, propertyValueText } from "src/properties/propertyMenu";
import { PaletteMenu } from "src/ui/paletteMenu";

const notices = vi.hoisted(() => [] as string[]);

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));

describe("プロパティ値テキスト", () => {
	it("リストを 1 行に 1 項目ずつコピーします", () => {
		expect(propertyValueText("list", ["a", "b"])).toBe("a\nb");
		expect(propertyValueText("tags", ["x"])).toBe("x");
	});

	it("スカラーをそのままコピーし、欠損値を何もコピーしません", () => {
		expect(propertyValueText("text", "hello")).toBe("hello");
		expect(propertyValueText("number", 4)).toBe("4");
		expect(propertyValueText("checkbox", false)).toBe("false");
		expect(propertyValueText("text", undefined)).toBe("");
	});

	it("ネストされた値を JSON としてコピーします", () => {
		expect(propertyValueText("unsupported", { a: 1 })).toBe('{"a":1}');
	});
});

describe("いくつかのノートのpopulatePropertyMenu", () => {
	const notes = ["a.md", "b.md", "c.md"].map(
		(path) => ({ path, basename: path.slice(0, -3) }) as unknown as TFile,
	);
	const frontmatters: Record<string, Record<string, unknown>> = {
		"a.md": { topic: ["x"] },
		"b.md": { other: 1 },
		"c.md": { topic: ["y"] },
	};

	function fixture() {
		const written: string[] = [];
		const app = {
			vault: {
				getFileByPath: (path: string) => notes.find((note) => note.path === path) ?? null,
			},
			metadataCache: {
				getFileCache: (file: TFile) => ({ frontmatter: frontmatters[file.path] }),
			},
			fileManager: {
				processFrontMatter: async (
					file: TFile,
					fn: (fm: Record<string, unknown>) => void,
				) => {
					fn(structuredClone(frontmatters[file.path]));
					written.push(file.path);
				},
			},
		} as unknown as App;
		const items: { title: string; click: () => void }[] = [];
		let selection: (selected: unknown) => void = () => {};
		const menu = {
			addItem: (configure: (item: unknown) => void) => {
				const entry = { title: "", click: () => {} };
				const item = {
					setTitle: (title: string) => ((entry.title = title), item),
					setIcon: () => item,
					setSearchTerms: () => item,
					setWarning: () => item,
					setCta: () => item,
					setKeepOpen: () => item,
					onClick: (callback: () => void) => ((entry.click = callback), item),
				};
				configure(item);
				items.push(entry);
			},
			onSelectionChange: (listener: (selected: unknown) => void) => (selection = listener),
			// Why: the real confirmation builds on the fake addItem and onSelectionChange above.
			addConfirmedItem: PaletteMenu.prototype.addConfirmedItem,
		} as unknown as PaletteMenu;
		const result: PropertyResult = {
			id: "property:topic",
			mode: "property",
			primary: "topic",
			secondary: "2/3 notes",
			icon: "list",
			key: "topic",
			kind: "list",
			section: "これらのノート",
			inNote: true,
			sourcePath: "a.md",
			sourcePaths: ["a.md", "b.md", "c.md"],
		};
		populatePropertyMenu(menu, { app } as unknown as MyPalettePlugin, result, vi.fn());
		const titles = () => items.map(({ title }) => title);
		return { items, titles, written, selection: (selected: unknown) => selection(selected) };
	}

	it("値をコピーする代わりに 1 つの確認された削除と単一ノートの削除を提供します", () => {
		const f = fixture();
		expect(f.titles()).toEqual([
			"編集",
			"検索で開く",
			"3 件のノートからプロパティを削除",
			"プロパティ名をコピー",
		]);
	});

	it("2 回押す必要があり、離れると最初のボタンがキャンセルされます", async () => {
		const f = fixture();
		const del = f.items[2];
		del.click();
		expect(del.title).toBe("もう一度クリックして 3 件のノートから削除");
		expect(f.written).toEqual([]);

		f.selection(f.items[0]);
		expect(del.title).toBe("3 件のノートからプロパティを削除");
		del.click();
		expect(f.written).toEqual([]);
	});

	it("キーを含むノートからのみキーを削除します", async () => {
		notices.length = 0;
		const f = fixture();
		const del = f.items[2];
		del.click();
		del.click();
		await vi.waitFor(() =>
			expect(notices).toEqual(["topic を 2 件のノートから削除しました。"]),
		);
		expect(f.written).toEqual(["a.md", "c.md"]);
	});
});
