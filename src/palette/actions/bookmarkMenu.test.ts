import type { App } from "obsidian";
import { TFile } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { addBookmarkMenuItems } from "src/palette/actions/bookmarkMenu";
import type { PaletteResult } from "src/palette/results";
import type { BookmarkEntry } from "src/search/bookmark/bookmarks";
import type { PaletteMenu } from "src/ui/paletteMenu";

const modals = vi.hoisted(() => ({ group: [] as unknown[], title: [] as unknown[] }));

vi.mock("obsidian", () => ({
	Notice: class {},
	TFile: class {
		constructor(public path: string) {}
	},
}));
vi.mock("src/search/bookmark/BookmarkGroupModal", () => ({
	BookmarkGroupModal: vi.fn(function (
		this: { open: () => void },
		_app: unknown,
		_instance: unknown,
		options: unknown,
	) {
		modals.group.push(options);
		this.open = vi.fn();
	}),
	BookmarkTitleModal: vi.fn(function (
		this: { open: () => void; inputEl: { select: () => void } },
		_app: unknown,
		_entry: unknown,
		onSubmit: unknown,
	) {
		modals.title.push(onSubmit);
		this.open = vi.fn();
		this.inputEl = { select: vi.fn() };
	}),
}));

interface GroupOptions {
	onChoose: (parent: BookmarkEntry | undefined, item: unknown) => void;
}

function file(path: string): TFile {
	const Ctor = TFile as unknown as new (path: string) => TFile;
	return new Ctor(path);
}

function setup(enabled = true) {
	modals.group.length = 0;
	modals.title.length = 0;
	const a: BookmarkEntry = { type: "file", path: "a.md" };
	const group: BookmarkEntry = { type: "group", title: "G", items: [] };
	const instance = {
		items: [a, group],
		addItem: vi.fn((item: BookmarkEntry, parent?: BookmarkEntry) =>
			(parent ? parent.items! : instance.items).push(item),
		),
		removeItem: vi.fn((item: BookmarkEntry) => {
			for (const list of [instance.items, group.items!]) {
				const index = list.indexOf(item);
				if (index >= 0) list.splice(index, 1);
			}
		}),
		onItemsChanged: vi.fn(),
	};
	const files = new Map([["b.md", file("b.md")]]);
	const app = {
		internalPlugins: { getEnabledPluginById: () => (enabled ? instance : null) },
		vault: { getAbstractFileByPath: (path: string) => files.get(path) ?? null },
	} as unknown as App;
	const actions = new Map<string, () => void>();
	const menu = {
		addItem: (configure: (item: unknown) => void) => {
			let title = "";
			const item = {
				setTitle: (value: string) => ((title = value), item),
				setIcon: () => item,
				onClick: (callback: () => void) => (actions.set(title, callback), item),
			};
			configure(item);
		},
	} as unknown as PaletteMenu;
	return { a, group, instance, app, plugin: { app } as MyPalettePlugin, menu, actions };
}

const base = { id: "", primary: "", secondary: "", icon: "" };

function bookmarkResult(entry: BookmarkEntry): PaletteResult {
	return { ...base, mode: "bookmark", kind: "file", entry };
}

it("offers rename, move and remove for one bookmark", () => {
	const s = setup();
	const changed = vi.fn();
	addBookmarkMenuItems({
		menu: s.menu,
		plugin: s.plugin,
		results: [bookmarkResult(s.a)],
		onBookmarksChanged: changed,
	});
	expect([...s.actions.keys()]).toEqual([
		"Rename bookmark…",
		"Move to bookmark group…",
		"Remove from bookmarks",
	]);

	s.actions.get("Rename bookmark…")!();
	(modals.title[0] as (title: string) => void)("Alpha");
	expect(s.a.title).toBe("Alpha");

	s.actions.get("Move to bookmark group…")!();
	(modals.group[0] as GroupOptions).onChoose(s.group, {
		label: "G",
		description: "G",
		target: { kind: "group", group: s.group },
	});
	expect(s.group.items).toEqual([s.a]);

	s.actions.get("Remove from bookmarks")!();
	expect(s.group.items).toEqual([]);
	expect(changed).toHaveBeenCalledTimes(3);
});

it("drops rename for several bookmarks", () => {
	const s = setup();
	const b: BookmarkEntry = { type: "search", query: "q" };
	addBookmarkMenuItems({
		menu: s.menu,
		plugin: s.plugin,
		results: [bookmarkResult(s.a), { ...base, mode: "bookmark", kind: "search", entry: b }],
	});
	expect([...s.actions.keys()]).toEqual(["Move to bookmark group…", "Remove from bookmarks"]);
});

it("bookmarks files from other modes and closes the palette after adding", () => {
	const s = setup();
	const done = vi.fn();
	addBookmarkMenuItems({
		menu: s.menu,
		plugin: s.plugin,
		results: [
			{ ...base, mode: "file", vaultPath: "b.md" },
			{ ...base, mode: "command", commandId: "x" },
		],
		onNoteActionDone: done,
	});
	expect([...s.actions.keys()]).toEqual(["Add to bookmarks…"]);
	s.actions.get("Add to bookmarks…")!();
	(modals.group[0] as GroupOptions).onChoose(undefined, {
		label: "Top level",
		target: { kind: "top" },
	});
	expect(s.instance.items.at(-1)).toMatchObject({ type: "file", path: "b.md" });
	expect(done).toHaveBeenCalledOnce();
});

it("adds nothing while the Bookmarks plugin is off or no result is a file", () => {
	const off = setup(false);
	addBookmarkMenuItems({
		menu: off.menu,
		plugin: off.plugin,
		results: [{ ...base, mode: "file", vaultPath: "b.md" }],
	});
	expect(off.actions.size).toBe(0);

	const s = setup();
	addBookmarkMenuItems({
		menu: s.menu,
		plugin: s.plugin,
		results: [{ ...base, mode: "command", commandId: "x" }],
	});
	expect(s.actions.size).toBe(0);
});
