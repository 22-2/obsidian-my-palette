import type { App } from "obsidian";
import { TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { MoveFileModal } from "src/palette/MoveFileModal";
import { addFileMoveMenuItem } from "src/palette/actions/fileMoveMenu";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";

vi.mock("obsidian", () => ({
	TFile: class {
		constructor(public path: string) {}
	},
}));
vi.mock("src/ignored-notes/ignoredPaths", () => ({
	isUserIgnoredPath: (_app: unknown, path: string) => path.startsWith("secret/"),
}));
vi.mock("src/palette/MoveFileModal", () => ({
	MoveFileModal: vi.fn(function (this: { open: () => void }) {
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

it("moves distinct indexed files of any type and skips the rest", () => {
	const results: PaletteResult[] = [
		{ ...base, mode: "file", vaultPath: "a.md" },
		{ ...base, mode: "link", file: files.get("a.md")!, line: 0 },
		{
			...base,
			mode: "everything",
			kind: "file",
			absolutePath: "C:/vault/image.png",
			vaultPath: "image.png",
			scope: "vault",
			attributes: "",
		},
		{ ...base, mode: "file", vaultPath: "secret/excluded.md", ignored: true },
		{ ...base, mode: "file", vaultPath: "secret/excluded.png", ignored: true },
		{ ...base, mode: "command", commandId: "x" },
	];
	const m = menu();
	const onSelected = vi.fn();
	addFileMoveMenuItem(m.instance, plugin, results, onSelected);
	expect(m.titles).toEqual(["Move to…"]);

	m.click();
	expect(onSelected).toHaveBeenCalledOnce();
	expect(MoveFileModal).toHaveBeenCalledWith(plugin, [
		files.get("a.md"),
		files.get("image.png"),
		{ excludedPath: "secret/excluded.md" },
	]);
});

it("uses the single-file title for one file", () => {
	const m = menu();
	addFileMoveMenuItem(m.instance, plugin, [{ ...base, mode: "file", vaultPath: "a.md" }]);
	expect(m.titles).toEqual(["Move to…"]);
});

it("adds nothing when no result is a movable file", () => {
	const m = menu();
	addFileMoveMenuItem(m.instance, plugin, [{ ...base, mode: "command", commandId: "x" }]);
	expect(m.titles).toEqual([]);
});
