import type { App, WorkspaceLeaf } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";

vi.mock("src/palette/actions/resultContextMenu", () => ({ populatePaletteResultMenu: vi.fn() }));

vi.mock("src/palette/executePaletteResult", () => ({
	executePaletteResult: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("src/palette/backgroundResultActions", () => ({
	openPaletteResultInBackground: vi.fn().mockResolvedValue(true),
}));
vi.mock("obsidian", () => ({
	App: class {},
	Component: class {},
	Modal: class {},
	TFile: class {},
	Menu: class {
		onHide() {}
		close() {}
		setParentElement() {}
		showAtMouseEvent() {}
	},
	ItemView: class {
		app: App;
		constructor(leaf: { app: App }) {
			this.app = leaf.app;
		}
	},
}));

function fixture() {
	const rootSplit = { doc: {} };
	const targetLeaf = {
		getRoot: () => rootSplit,
		getViewState: () => ({ pinned: false }),
		view: {},
	};
	const newMainLeaf = { getRoot: () => rootSplit, view: {} };
	const workspace = {
		rootSplit,
		activeLeaf: targetLeaf,
		getLeavesOfType: () => [],
		getMostRecentLeaf: vi.fn().mockReturnValue(targetLeaf),
		createLeafInParent: vi.fn().mockReturnValue(newMainLeaf),
	};
	const app = {
		workspace,
	} as unknown as App;
	const plugin = { app, settings: {} } as MyPalettePlugin;
	const panel = { focusSearchInput: vi.fn() };
	// Exercise the view's action policy without mounting its unrelated DOM controls.
	const view = new PaletteView({ app } as unknown as WorkspaceLeaf, plugin) as unknown as {
		session: object;
		panel: typeof panel;
		execute: (result: PaletteResult, action: "primary") => Promise<void>;
		openInBackground: (result: PaletteResult) => Promise<void>;
		openInMainWindow: (result: PaletteResult) => Promise<void>;
		contentEl: { ownerDocument: object };
		showContextMenu: (
			result: PaletteResult,
			event: MouseEvent,
			selected: PaletteResult[],
		) => void;
	};
	view.session = {};
	view.panel = panel;
	view.contentEl = { ownerDocument: rootSplit.doc };
	const result: PaletteResult = {
		id: "note",
		mode: "file",
		primary: "Note",
		secondary: "",
		icon: "file",
		vaultPath: "Note.md",
	};
	return { view, panel, plugin, workspace, newMainLeaf, targetLeaf, result };
}

it("activates normal note opens without pulling focus back to the search input", async () => {
	const f = fixture();
	await f.view.execute(f.result, "primary");
	expect(executePaletteResult).toHaveBeenCalledWith(
		f.plugin,
		f.result,
		"primary",
		expect.objectContaining({ active: true, targetLeaf: f.targetLeaf, closeWhenDone: false }),
	);
	expect(f.panel.focusSearchInput).not.toHaveBeenCalled();
});

it("keeps the search input focused after a background open", async () => {
	const f = fixture();
	await f.view.openInBackground(f.result);
	expect(openPaletteResultInBackground).toHaveBeenCalledWith(f.plugin, f.result);
	expect(f.panel.focusSearchInput).toHaveBeenCalledTimes(1);
});

it("offers main-window navigation only while the palette belongs to a popout", () => {
	const f = fixture();
	f.view.showContextMenu(f.result, {} as MouseEvent, [f.result]);
	expect(populatePaletteResultMenu).toHaveBeenLastCalledWith(
		expect.objectContaining({ openInMainWindow: undefined }),
	);
	f.view.contentEl.ownerDocument = {};
	f.view.showContextMenu(f.result, {} as MouseEvent, [f.result]);
	expect(populatePaletteResultMenu).toHaveBeenLastCalledWith(
		expect.objectContaining({ openInMainWindow: expect.any(Function) }),
	);
});

it("opens each main-window action in a fresh tab even when a popout is active", async () => {
	const f = fixture();
	f.workspace.activeLeaf = { ...f.targetLeaf, getRoot: () => ({ doc: {} }) };
	const secondMainLeaf = { ...f.newMainLeaf };
	f.workspace.createLeafInParent
		.mockReturnValueOnce(f.newMainLeaf)
		.mockReturnValueOnce(secondMainLeaf);
	await f.view.openInMainWindow(f.result);
	expect(executePaletteResult).toHaveBeenLastCalledWith(
		f.plugin,
		f.result,
		"primary",
		expect.objectContaining({
			targetLeaf: f.newMainLeaf,
			active: true,
			reuseExternalMarkdownLeaf: false,
		}),
	);
	await f.view.openInMainWindow(f.result);
	expect(f.workspace.createLeafInParent).toHaveBeenCalledTimes(2);
	expect(f.workspace.createLeafInParent).toHaveBeenLastCalledWith(f.workspace.rootSplit, 0);
	expect(f.workspace.getMostRecentLeaf).not.toHaveBeenCalled();
	expect(executePaletteResult).toHaveBeenLastCalledWith(
		f.plugin,
		f.result,
		"primary",
		expect.objectContaining({
			targetLeaf: secondMainLeaf,
			active: true,
			reuseExternalMarkdownLeaf: false,
		}),
	);
	expect(f.panel.focusSearchInput).not.toHaveBeenCalled();
});
