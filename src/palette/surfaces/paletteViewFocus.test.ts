import type { App, WorkspaceLeaf } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { PaletteView } from "src/palette/surfaces/PaletteView";

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
	ItemView: class {
		app: App;
		constructor(leaf: { app: App }) {
			this.app = leaf.app;
		}
	},
}));

function fixture() {
	const rootSplit = {};
	const targetLeaf = { getRoot: () => rootSplit, view: {} };
	const app = {
		workspace: { rootSplit, activeLeaf: targetLeaf, getLeavesOfType: () => [] },
	} as unknown as App;
	const plugin = { app, settings: {} } as MyPalettePlugin;
	const panel = { focusSearchInput: vi.fn() };
	// Exercise the view's action policy without mounting its unrelated DOM controls.
	const view = new PaletteView({ app } as unknown as WorkspaceLeaf, plugin) as unknown as {
		session: object;
		panel: typeof panel;
		execute: (result: PaletteResult, action: "primary") => Promise<void>;
		openInBackground: (result: PaletteResult) => Promise<void>;
	};
	view.session = {};
	view.panel = panel;
	const result: PaletteResult = {
		id: "note",
		mode: "file",
		primary: "Note",
		secondary: "",
		icon: "file",
		vaultPath: "Note.md",
	};
	return { view, panel, plugin, targetLeaf, result };
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
