import type { App } from "obsidian";
import { TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { addMergeMenuItem } from "src/palette/actions/mergeMenu";
import type { PaletteResult } from "src/palette/results";
import { MergeTargetModal } from "src/merge/MergeTargetModal";
import type { PaletteMenu } from "src/ui/paletteMenu";

vi.mock("obsidian", () => ({
	TFile: class {
		extension = "";
		constructor(public path: string) {
			this.extension = path.split(".").pop() ?? "";
		}
	},
}));
vi.mock("src/merge/MergeTargetModal", () => ({
	MergeTargetModal: vi.fn(function (this: { open: () => void }) {
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

it("個別のマークダウンノートのみのマージを提供します", () => {
	const results: PaletteResult[] = [
		{ ...base, mode: "file", vaultPath: "a.md" },
		{ ...base, mode: "link", file: files.get("a.md")!, line: 0 },
		{ ...base, mode: "file", vaultPath: "image.png" },
		{ ...base, mode: "command", commandId: "x" },
	];
	const m = menu();
	const onDone = vi.fn();
	addMergeMenuItem(m.instance, plugin, results, onDone);
	expect(m.titles).toEqual(["マージ…"]);

	m.click();
	expect(MergeTargetModal).toHaveBeenCalledWith(plugin, [files.get("a.md")], onDone);
});

it("結果がマークダウンノートでない場合は何も追加しません", () => {
	const m = menu();
	addMergeMenuItem(m.instance, plugin, [{ ...base, mode: "file", vaultPath: "image.png" }]);
	expect(m.titles).toEqual([]);
});
