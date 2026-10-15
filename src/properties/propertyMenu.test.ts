import type { App, TFile } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import { populatePropertyMenu, propertyValueText } from "src/properties/propertyMenu";
import type { PaletteMenu } from "src/ui/paletteMenu";

const notices = vi.hoisted(() => [] as string[]);

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));

describe("propertyValueText", () => {
	it("copies a list one item per line", () => {
		expect(propertyValueText("list", ["a", "b"])).toBe("a\nb");
		expect(propertyValueText("tags", ["x"])).toBe("x");
	});

	it("copies scalars as they are and missing values as nothing", () => {
		expect(propertyValueText("text", "hello")).toBe("hello");
		expect(propertyValueText("number", 4)).toBe("4");
		expect(propertyValueText("checkbox", false)).toBe("false");
		expect(propertyValueText("text", undefined)).toBe("");
	});

	it("copies a nested value as JSON", () => {
		expect(propertyValueText("unsupported", { a: 1 })).toBe('{"a":1}');
	});
});

describe("populatePropertyMenu for several notes", () => {
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
					setWarning: () => item,
					setCta: () => item,
					setKeepOpen: () => item,
					onClick: (callback: () => void) => ((entry.click = callback), item),
				};
				configure(item);
				items.push(entry);
			},
			onSelectionChange: (listener: (selected: unknown) => void) => (selection = listener),
		} as unknown as PaletteMenu;
		const result: PropertyResult = {
			id: "property:topic",
			mode: "property",
			primary: "topic",
			secondary: "2/3 notes",
			icon: "list",
			key: "topic",
			kind: "list",
			section: "These notes",
			inNote: true,
			sourcePath: "a.md",
			sourcePaths: ["a.md", "b.md", "c.md"],
		};
		populatePropertyMenu(menu, { app } as unknown as MyPalettePlugin, result, vi.fn());
		const titles = () => items.map(({ title }) => title);
		return { items, titles, written, selection: (selected: unknown) => selection(selected) };
	}

	it("offers one confirmed delete instead of copy value and the single-note delete", () => {
		const f = fixture();
		expect(f.titles()).toEqual([
			"Edit",
			"Open in search",
			"Delete property from 3 notes",
			"Copy property name",
		]);
	});

	it("needs a second press, and moving away cancels the first", async () => {
		const f = fixture();
		const del = f.items[2];
		del.click();
		expect(del.title).toBe("Click again to delete from 3 notes");
		expect(f.written).toEqual([]);

		f.selection(f.items[0]);
		expect(del.title).toBe("Delete property from 3 notes");
		del.click();
		expect(f.written).toEqual([]);
	});

	it("deletes the key only from the notes that have it", async () => {
		notices.length = 0;
		const f = fixture();
		const del = f.items[2];
		del.click();
		del.click();
		await vi.waitFor(() => expect(notices).toEqual(["Deleted topic from 2 notes."]));
		expect(f.written).toEqual(["a.md", "c.md"]);
	});
});
