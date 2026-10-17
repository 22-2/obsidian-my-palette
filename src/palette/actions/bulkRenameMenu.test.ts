import type { App } from "obsidian";
import { TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { addBulkRenameMenuItem } from "src/palette/actions/bulkRenameMenu";
import type { PaletteResult } from "src/palette/results";
import { BulkRenameModal } from "src/rename/BulkRenameModal";
import type { PaletteMenu } from "src/ui/paletteMenu";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(public path: string) {}
	},
}));
vi.mock("src/rename/BulkRenameModal", () => ({
	BulkRenameModal: vi.fn(function (this: { open: () => void }) {
		this.open = vi.fn();
	}),
}));

function file(path: string): TFile {
	const Ctor = TFile as unknown as new (path: string) => TFile;
	return new Ctor(path);
}

const files = new Map([
	["a.md", file("a.md")],
	["image.png", file("image.png")],
]);
const app = {
	vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
} as unknown as App;
const plugin = { app } as unknown as MyPalettePlugin;

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

it("renames distinct vault files of any type and skips everything else", () => {
	const results: PaletteResult[] = [
		{ ...base, mode: "file", vaultPath: "a.md" },
		{ ...base, mode: "link", file: files.get("a.md")!, line: 0 },
		{ ...base, mode: "file", vaultPath: "image.png" },
		{ ...base, mode: "file", vaultPath: "excluded/x.md", ignored: true },
		{ ...base, mode: "command", commandId: "x" },
	];
	const m = menu();
	const onDone = vi.fn();
	addBulkRenameMenuItem(m.instance, plugin, results, onDone);
	expect(m.titles).toEqual(["名前を変更…"]);

	m.click();
	expect(BulkRenameModal).toHaveBeenCalledWith(
		plugin,
		[files.get("a.md"), files.get("image.png")],
		onDone,
	);
});

it("adds nothing when no result is a vault file", () => {
	const m = menu();
	addBulkRenameMenuItem(m.instance, plugin, [{ ...base, mode: "command", commandId: "x" }]);
	expect(m.titles).toEqual([]);
});
