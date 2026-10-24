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

describe("パレットビューの配置", () => {
	it("復元されたサイドバーテー​​ブルのみが存在する場合に、新しいセンタータブを開きます", async () => {
		const { plugin, workspace, leaf } = fixture();
		workspace.getLeavesOfType.mockReturnValue([{ getRoot: () => workspace.rightSplit }]);
		await plugin.paletteOpener.openPaletteTableView("project");
		expect(workspace.getLeaf).toHaveBeenCalledWith("tab");
		expect(workspace.ensureSideLeaf).not.toHaveBeenCalled();
		expect(leaf.setViewState).toHaveBeenCalledWith({
			type: PALETTE_TABLE_VIEW_TYPE,
			active: true,
			state: expect.objectContaining({ input: "project" }),
		});
		expect(workspace.revealLeaf).toHaveBeenCalledWith(leaf);
	});

	it("保存されたクエリを置き換えたり並べ替えたりせずに、既存の中央テーブルを表示します", async () => {
		const { plugin, workspace } = fixture();
		const existing = {
			getRoot: () => workspace.rootSplit,
			view: {},
			setViewState: vi.fn(),
		} as unknown as WorkspaceLeaf;
		workspace.getLeavesOfType.mockReturnValue([existing]);
		await plugin.paletteOpener.openPaletteTableView("replacement query");
		expect(workspace.getLeaf).not.toHaveBeenCalled();
		expect(existing.setViewState).not.toHaveBeenCalled();
		expect(workspace.revealLeaf).toHaveBeenCalledWith(existing);
	});

	it("ピン留めされたソースとソート状態とともにテーブルを新しい中央タブに複製します", async () => {
		const { plugin, workspace, leaf } = fixture();
		await plugin.paletteOpener.openNewPaletteView({
			input: "project",
			fixedMode: "backlink",
			sourcePath: "Source.md",
			sourcePinned: true,
			tableState: normalizePaletteTableState({
				displayMode: "table",
				sorting: [{ id: "prior", desc: true }],
			}),
			viewType: PALETTE_TABLE_VIEW_TYPE,
		});
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
				includeIgnored: false,
				displayMode: "table",
				sorting: [{ id: "prior", desc: true }],
				columnOrder: ["name", "path", "modified", "prior"],
				hiddenColumns: [],
			},
		});
	});

	it("通常のパレットとその複製を右側のサイドバーに保持します", async () => {
		const { plugin, workspace } = fixture();
		await plugin.paletteOpener.openPaletteView("list query");
		expect(workspace.ensureSideLeaf).toHaveBeenCalledWith(PALETTE_VIEW_TYPE, "right", {
			active: true,
			reveal: true,
			state: expect.objectContaining({ input: "list query" }),
		});
		await plugin.paletteOpener.openNewPaletteView({ input: "another list query" });
		expect(workspace.getRightLeaf).toHaveBeenCalledWith(false);
		expect(workspace.getLeaf).not.toHaveBeenCalled();
	});
});
