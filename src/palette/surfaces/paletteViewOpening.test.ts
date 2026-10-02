import type { App, PluginManifest, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import MyPalettePlugin from "src/main";
import { normalizePaletteTableState } from "src/palette/table/paletteTableModel";
import { PALETTE_TABLE_VIEW_TYPE, PALETTE_VIEW_TYPE } from "src/palette/surfaces/paletteViewTypes";

vi.mock("obsidian", () => ({
	Plugin: class {
		constructor(public app: App) {}
	},
	ItemView: class {},
	Component: class {},
	Modal: class {},
	PluginSettingTab: class {},
}));

function fixture() {
	const rootSplit = {};
	const rightSplit = {};
	const leaf = { view: {}, setViewState: vi.fn().mockResolvedValue(undefined) };
	const workspace = {
		rootSplit,
		rightSplit,
		getLeavesOfType: vi.fn().mockReturnValue([]),
		getLeaf: vi.fn().mockReturnValue(leaf),
		getRightLeaf: vi.fn().mockReturnValue(leaf),
		ensureSideLeaf: vi.fn().mockResolvedValue(leaf),
		revealLeaf: vi.fn().mockResolvedValue(undefined),
	};
	const plugin = new MyPalettePlugin({ workspace } as unknown as App, {} as PluginManifest);
	return { plugin, workspace, leaf };
}

describe("palette view placement", () => {
	it("opens a new center tab when only a restored sidebar table exists", async () => {
		const { plugin, workspace, leaf } = fixture();
		workspace.getLeavesOfType.mockReturnValue([{ getRoot: () => workspace.rightSplit }]);
		await plugin.openPaletteTableView("project");
		expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
		expect(workspace.ensureSideLeaf).not.toHaveBeenCalled();
		expect(leaf.setViewState).toHaveBeenCalledWith({
			type: PALETTE_TABLE_VIEW_TYPE,
			active: true,
			state: expect.objectContaining({ input: "project" }),
		});
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
	});

	it("reveals an existing center table without replacing its saved query or sorting", async () => {
		const { plugin, workspace } = fixture();
		const existing = {
			getRoot: () => workspace.rootSplit,
			view: {},
			setViewState: vi.fn(),
		} as unknown as WorkspaceLeaf;
		workspace.getLeavesOfType.mockReturnValue([existing]);
		await plugin.openPaletteTableView("replacement query");
		expect(workspace.getLeaf).not.toHaveBeenCalled();
		expect(existing.setViewState).not.toHaveBeenCalled();
		expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
	});

	it("duplicates tables into new center tabs with their pinned source and sort state", async () => {
		const { plugin, workspace, leaf } = fixture();
		await plugin.openNewPaletteView(
			"project",
			"backlink",
			"Source.md",
			true,
			normalizePaletteTableState({
				displayMode: "table",
				sorting: [{ id: "prior", desc: true }],
			}),
			PALETTE_TABLE_VIEW_TYPE,
		);
		expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
		expect(workspace.getRightLeaf).not.toHaveBeenCalled();
		expect(leaf.setViewState).toHaveBeenCalledWith({
			type: PALETTE_TABLE_VIEW_TYPE,
			active: true,
			state: {
				input: "project",
				fixedMode: "backlink",
				sourcePath: "Source.md",
				sourcePinned: true,
				displayMode: "table",
				sorting: [{ id: "prior", desc: true }],
				columnOrder: ["name", "path", "modified", "prior"],
				hiddenColumns: [],
			},
		});
	});

	it("keeps regular palettes and their duplicates in the right sidebar", async () => {
		const { plugin, workspace } = fixture();
		await plugin.openPaletteView("list query");
		expect(workspace.ensureSideLeaf).toHaveBeenCalledWith(PALETTE_VIEW_TYPE, "right", {
			active: true,
			reveal: true,
			state: expect.objectContaining({ input: "list query" }),
		});
		await plugin.openNewPaletteView("another list query");
		expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
		expect(workspace.getLeaf).not.toHaveBeenCalled();
	});
});
