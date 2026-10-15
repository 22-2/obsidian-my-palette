import type { App } from "obsidian";
import { TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { addPropertyEditMenuItem } from "src/palette/actions/propertyEditMenu";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(
			public path: string,
			public extension: string,
		) {}
	},
}));

function file(path: string): TFile {
	const Ctor = TFile as unknown as new (path: string, extension: string) => TFile;
	return new Ctor(path, path.split(".").pop() ?? "");
}

const files = new Map([
	["a.md", file("a.md")],
	["image.png", file("image.png")],
]);
const openPalette = vi.fn();
const plugin = {
	app: {
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
	} as unknown as App,
	settings: { modes: { properties: { alias: "pr" } } },
	paletteOpener: { openPalette },
} as unknown as MyPalettePlugin;

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
	} as unknown as PaletteMenu;
	return { instance, titles, click: () => click() };
}

const base = { id: "", primary: "", secondary: "", icon: "" };
const note: PaletteResult = { ...base, mode: "file", vaultPath: "a.md" };

it("opens Properties for the selected note after closing the palette", () => {
	const m = menu();
	const onSelected = vi.fn();
	addPropertyEditMenuItem(m.instance, plugin, [note], onSelected);
	expect(m.titles).toEqual(["Edit properties…"]);

	m.click();
	expect(onSelected).toHaveBeenCalledOnce();
	expect(openPalette).toHaveBeenCalledWith("pr ", undefined, {
		modeEntries: true,
		sourceFile: files.get("a.md"),
	});
});

it("offers nothing for several results or a non-Markdown file", () => {
	const m = menu();
	addPropertyEditMenuItem(m.instance, plugin, [note, note]);
	addPropertyEditMenuItem(m.instance, plugin, [
		{ ...base, mode: "file", vaultPath: "image.png" },
	]);
	expect(m.titles).toEqual([]);
});
