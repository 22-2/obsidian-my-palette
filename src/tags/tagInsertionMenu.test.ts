import type { App, Menu } from "obsidian";
import { TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type { PaletteResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";
import { addTagInsertionMenuItems } from "src/tags/tagInsertionMenu";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(
			public path: string,
			public extension: string,
		) {}
	},
}));
vi.mock("src/tags/insertTags", () => ({ insertTags: vi.fn() }));

function file(path: string): TFile {
	const Ctor = TFile as unknown as new (path: string, extension: string) => TFile;
	return new Ctor(path, path.split(".").pop() ?? "");
}

const files = new Map([
	["a.md", file("a.md")],
	["b.md", file("b.md")],
	["image.png", file("image.png")],
]);
const app = {
	vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
} as unknown as App;
const recentTags = { getIds: () => [], record: vi.fn() };

function menu() {
	const titles: string[] = [];
	let click = () => {};
	const instance = {
		addItem: (configure: (item: unknown) => void) => {
			const item = {
				setTitle: (title: string) => (titles.push(title), item),
				setIcon: () => item,
				onClick: (callback: () => void) => ((click = callback), item),
			};
			configure(item);
		},
	} as unknown as Menu;
	return { instance, titles, click: () => click() };
}

const base = { id: "", primary: "", secondary: "", icon: "" };

it("adds tags only to distinct indexed Markdown notes", () => {
	const results: PaletteResult[] = [
		{ ...base, mode: "file", vaultPath: "a.md" },
		{
			...base,
			mode: "everything",
			kind: "file",
			scope: "vault",
			attributes: "",
			absolutePath: "",
			vaultPath: "a.md",
		},
		{ ...base, mode: "smart", file: files.get("b.md")!, score: 1 },
		{ ...base, mode: "file", vaultPath: "image.png" },
		{ ...base, mode: "file", vaultPath: "ignored.md", ignored: true },
		{ ...base, mode: "command", commandId: "x" },
	];
	const onSelected = vi.fn();
	const m = menu();

	addTagInsertionMenuItems(m.instance, app, recentTags, results, onSelected);
	expect(m.titles).toEqual(["Add tags to 2 notes…"]);
	m.click();

	expect(onSelected).toHaveBeenCalledOnce();
	expect(insertTags).toHaveBeenCalledWith(
		app,
		[files.get("a.md"), files.get("b.md")],
		recentTags,
	);
});

it("adds no item when nothing can be tagged", () => {
	const m = menu();
	addTagInsertionMenuItems(m.instance, app, recentTags, [
		{ ...base, mode: "command", commandId: "x" },
	]);
	expect(m.titles).toEqual([]);
});
