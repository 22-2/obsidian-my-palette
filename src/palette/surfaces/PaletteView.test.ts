import type { App, WorkspaceLeaf } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { FileResult, SearchHistoryResult } from "src/palette/results";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import { PaletteTableView } from "src/palette/surfaces/PaletteTableView";
import { installObsidianDom } from "src/ui/testing/obsidianDom";
import { createSelectorPlugin } from "src/ui/testing/selectorPlugin";

vi.mock("obsidian", async () => {
	const dom = await import("src/ui/testing/obsidianDom");
	class TFile {
		constructor(public path: string) {}
	}
	/** Mounts children and events the way Obsidian's ItemView does, on a real DOM. */
	class ItemView extends dom.Component {
		readonly app: App;
		readonly containerEl = dom.buildElement("div");
		readonly contentEl = this.containerEl.appendChild(dom.buildElement("div"));
		private children: { unload(): void }[] = [];
		private events: (() => void)[] = [];
		constructor(readonly leaf: { app: App }) {
			super();
			this.app = leaf.app;
		}
		addChild<T extends { load(): void; unload(): void }>(child: T): T {
			this.children.push(child);
			return child;
		}
		removeChild<T extends { unload(): void }>(child: T): T {
			this.children = this.children.filter((entry) => entry !== child);
			child.unload();
			return child;
		}
		registerEvent(ref: { off(): void }): void {
			this.events.push(() => ref.off());
		}
		onPaneMenu(): void {}
		async open(): Promise<void> {
			document.body.append(this.containerEl);
			await (this as unknown as { onOpen(): Promise<void> }).onOpen();
		}
		async close(): Promise<void> {
			await (this as unknown as { onClose(): Promise<void> }).onClose();
			for (const child of this.children.splice(0)) child.unload();
			for (const off of this.events.splice(0)) off();
			this.containerEl.remove();
		}
	}
	return { ...dom, TFile, ItemView, Menu: class {} };
});
vi.mock("src/palette/executePaletteResult", () => ({
	executePaletteResult: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("src/palette/backgroundResultActions", () => ({
	openPaletteResultInBackground: vi.fn().mockResolvedValue(true),
}));
vi.mock("src/palette/actions/resultContextMenu", () => ({ populatePaletteResultMenu: vi.fn() }));
vi.mock("src/ui/menus", () => ({ showMenuAtEvent: vi.fn() }));
vi.mock("src/ui/paletteMenu", () => ({
	PaletteMenu: class {
		onHide() {}
		close() {}
		setParentElement() {}
		addItem() {}
		addSeparator() {}
	},
}));

const cleanups: (() => Promise<void> | void)[] = [];

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"HTMLElement",
		"Node",
		"Event",
		"MouseEvent",
		"KeyboardEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(async () => {
	for (const cleanup of cleanups.splice(0)) await cleanup();
	document.body.replaceChildren();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

function fileResult(name: string): FileResult {
	return {
		id: `file:${name}.md`,
		mode: "file",
		primary: name,
		secondary: `${name}.md`,
		icon: "file",
		vaultPath: `${name}.md`,
	};
}

/** A workspace that fires `active-leaf-change` like Obsidian when a test switches notes. */
function host() {
	const rootSplit = { doc: {} };
	const listeners: ((leaf: unknown) => void)[] = [];
	const centerLeaf = (path: string) => ({
		getRoot: () => rootSplit,
		getViewState: () => ({ pinned: false }),
		view: { file: { path } },
	});
	let recent = centerLeaf("Notes/First.md");
	const workspace = {
		rootSplit,
		getMostRecentLeaf: () => recent,
		getActiveFile: () => recent.view.file,
		getLeaf: () => recent,
		getLeavesOfType: () => [],
		iterateAllLeaves: (callback: (leaf: unknown) => void) => callback(recent),
		requestSaveLayout: vi.fn(),
		on: (name: string, callback: (leaf: unknown) => void) => {
			if (name === "active-leaf-change") listeners.push(callback);
			return { off: () => listeners.splice(listeners.indexOf(callback), 1) };
		},
	};
	const events = { on: () => ({ off() {} }) };
	const app = {
		workspace,
		vault: { ...events, getAbstractFileByPath: () => null },
		metadataCache: events,
	} as unknown as App;
	const fileSearch = vi.fn().mockResolvedValue([fileResult("Alpha"), fileResult("Beta")]);
	const commandSearch = vi.fn().mockResolvedValue([]);
	const plugin = Object.assign(createSelectorPlugin(app), {
		providers: { file: { search: fileSearch }, command: { search: commandSearch } },
		paletteOpener: { openNewPaletteView: vi.fn() },
		formatSearchHistoryInput: (entry: SearchHistoryResult) => entry.input,
	}) as unknown as MyPalettePlugin;
	const switchTo = (path: string) => {
		recent = centerLeaf(path);
		for (const listener of [...listeners]) listener(recent);
	};
	return { app, plugin, workspace, fileSearch, commandSearch, switchTo, listeners };
}

async function settle(): Promise<void> {
	for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

type MountedView = PaletteView & {
	open(): Promise<void>;
	close(): Promise<void>;
	contentEl: HTMLElement;
};

async function mount(table = false, state: Record<string, unknown> = {}) {
	const h = host();
	const leaf = { app: h.app } as unknown as WorkspaceLeaf;
	const view = (
		table ? new PaletteTableView(leaf, h.plugin) : new PaletteView(leaf, h.plugin)
	) as MountedView;
	await view.setState(state);
	await view.open();
	cleanups.push(() => view.close());
	await settle();
	const root = view.contentEl;
	const input = root.querySelector<HTMLInputElement>("input")!;
	// The panel may mount on the view's own content element.
	const panel = () =>
		root.hasAttribute("data-route") ? root : root.querySelector<HTMLElement>("[data-route]")!;
	const labels = () =>
		[...root.querySelectorAll(".my-palette-suggestion__label")].map((el) => el.textContent);
	return { ...h, view, root, input, panel, labels };
}

function key(el: HTMLElement, name: string) {
	el.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
}

describe("PaletteView", () => {
	it("searches on open and follows the active note in its footer", async () => {
		const f = await mount();
		expect(f.labels()).toEqual(expect.arrayContaining(["Alpha", "Beta"]));
		expect(f.root.textContent).toContain("元ファイル: Notes/First.md");
		f.switchTo("Notes/Second.md");
		expect(f.root.textContent).toContain("元ファイル: Notes/Second.md");
	});

	it("keeps the selected row when the active note changes", async () => {
		const f = await mount(false, { input: "a" });
		// 先頭はモードの行なので、ArrowDown で選ばれるのは最初のファイル(Alpha)。
		key(f.input, "ArrowDown");
		const active = () => f.root.querySelector(".suggestion-item.is-active")?.textContent;
		expect(active()).toContain("Alpha");
		f.switchTo("Notes/Second.md");
		expect(active()).toContain("Alpha");
	});

	it("keeps the double-clicked row selected after its note opens", async () => {
		const f = await mount(false, { input: "a" });
		const beta = [...f.root.querySelectorAll<HTMLElement>(".suggestion-item")].find((el) =>
			el.textContent?.includes("Beta"),
		)!;
		beta.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, button: 0, detail: 2 }));
		await settle();
		const active = () => f.root.querySelector(".suggestion-item.is-active")?.textContent;
		expect(active()).toContain("Beta");
		f.switchTo("Beta.md");
		expect(active()).toContain("Beta");
	});

	it("keeps a pinned source when the active note changes", async () => {
		const f = await mount(false, { sourcePath: "Pinned.md", sourcePinned: true });
		f.switchTo("Notes/Second.md");
		expect(f.root.textContent).toContain("元ファイル: Pinned.md");
		expect(f.view.getState()).toMatchObject({ sourcePath: "Pinned.md", sourcePinned: true });
	});

	it("opens a chosen result in the center pane without closing the view", async () => {
		const f = await mount(false, { input: "alpha" });
		key(f.input, "Enter");
		await settle();
		expect(executePaletteResult).toHaveBeenCalledExactlyOnceWith(
			f.plugin,
			expect.objectContaining({ id: "file:Alpha.md" }),
			"primary",
			expect.objectContaining({ closeWhenDone: false, active: true }),
		);
		expect(f.root.isConnected).toBe(true);
	});

	it("restores a mode from its alias, persists it, and clears the query before Home", async () => {
		const f = await mount(false, { input: "> build" });
		expect(f.panel().getAttribute("data-mode")).toBe("command");
		expect(f.commandSearch).toHaveBeenCalledWith(expect.objectContaining({ query: "build" }));
		expect(f.view.getState()).toMatchObject({ input: "> build" });

		key(f.input, "Escape");
		await settle();
		expect(f.panel().getAttribute("data-route")).toBe("home");
		expect(f.input.value).toBe(">");

		// A view never closes itself: Escape on Home clears the query instead.
		key(f.input, "Escape");
		expect(f.input.value).toBe("");
		expect(f.root.isConnected).toBe(true);
	});

	it("saves the typed query in the layout so a restored pane resumes it", async () => {
		const f = await mount();
		f.input.value = "beta";
		f.input.dispatchEvent(new Event("input", { bubbles: true }));
		expect(f.view.getState()).toMatchObject({ input: "beta" });
		expect(f.workspace.requestSaveLayout).toHaveBeenCalled();
	});

	it("keeps the last query in its state after closing", async () => {
		const f = await mount(false, { input: "> deploy" });
		await f.view.close();
		cleanups.pop();
		expect(f.view.getState()).toMatchObject({ input: "> deploy" });
		expect(f.listeners).toHaveLength(0);
	});

	it("renders the table view with column headers and keeps its own presentation", async () => {
		const f = await mount(true, { input: "a", displayMode: "list" });
		expect(f.root.querySelector("table, [role='grid'], .my-palette-table")).not.toBeNull();
		expect(f.view.getState()).toMatchObject({ displayMode: "table", input: "a" });
	});
});
