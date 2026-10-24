import type { WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import { PaletteTableView } from "src/palette/surfaces/PaletteTableView";
import { PALETTE_VIEW_TYPE, PALETTE_TABLE_VIEW_TYPE } from "src/palette/surfaces/paletteViewTypes";

vi.mock("obsidian", () => ({
	App: class {},
	Component: class {},
	ItemView: class {
		onPaneMenu(): void {}
	},
	Modal: class {},
	Menu: class {},
	TFile: class {},
	setIcon: vi.fn(),
}));

function createViews() {
	const leaf = {} as WorkspaceLeaf;
	const paletteOpener = { openNewPaletteView: vi.fn() };
	const plugin = { paletteOpener } as unknown as MyPalettePlugin;
	return {
		list: new PaletteView(leaf, plugin),
		table: new PaletteTableView(leaf, plugin),
		plugin,
	};
}

describe("専用のパレットビュー", () => {
	it("状態を復元する前に、独自のワークスペース ID を使用してテーブルを直接開きます。", () => {
		const { list, table } = createViews();
		expect(list.getViewType()).toBe(PALETTE_VIEW_TYPE);
		expect(table.getViewType()).toBe(PALETTE_TABLE_VIEW_TYPE);
		expect(table.getState().displayMode).toBe("table");
		expect(table.getDisplayText()).toBe("表のパレット");
		expect(table.getIcon()).toBe("table");
	});

	it("競合するモードフラグを持つ従来のレイアウトを復元するときに、登録されたプレゼンテーションを保持します", async () => {
		const { list, table } = createViews();
		await list.setState({ input: "list query", displayMode: "table" });
		await table.setState({
			input: "table query",
			displayMode: "list",
			sorting: [{ id: "prior", desc: true }],
			columnOrder: ["prior", "name", "path", "modified"],
			hiddenColumns: ["path"],
		});
		expect(list.getState()).toMatchObject({ input: "list query", displayMode: "list" });
		expect(table.getState()).toMatchObject({
			input: "table query",
			displayMode: "table",
			sorting: [{ id: "prior", desc: true }],
			columnOrder: ["prior", "name", "path", "modified"],
			hiddenColumns: ["path"],
		});
	});

	it("テーブルを別のテーブルとして複製し、クエリ、ソースピン、ソート優先順位を保持します。", async () => {
		const { table, plugin } = createViews();
		await table.setState({
			input: "project",
			fixedMode: "backlink",
			sourcePath: "Projects/Home.md",
			sourcePinned: true,
			columnOrder: ["prior", "name", "path", "modified"],
			hiddenColumns: ["path"],
			sorting: [
				{ id: "modified", desc: true },
				{ id: "name", desc: false },
			],
		});
		let duplicate: (() => void) | undefined;
		const item = {
			setTitle: vi.fn().mockReturnThis(),
			setIcon: vi.fn().mockReturnThis(),
			onClick: (callback: () => void) => {
				duplicate = callback;
				return item;
			},
		};
		const menu = { addItem: (callback: (value: typeof item) => void) => callback(item) };
		table.onPaneMenu(menu as unknown as Parameters<PaletteTableView["onPaneMenu"]>[0], "test");
		expect(duplicate).toBeDefined();
		duplicate?.();
		expect(plugin.paletteOpener.openNewPaletteView).toHaveBeenCalledWith({
			input: "project",
			fixedMode: "backlink",
			sourcePath: "Projects/Home.md",
			sourcePinned: true,
			includeIgnored: false,
			tableState: expect.objectContaining({
				columnOrder: ["prior", "name", "path", "modified"],
				hiddenColumns: ["path"],
				sorting: [
					{ id: "modified", desc: true },
					{ id: "name", desc: false },
				],
			}),
			viewType: PALETTE_TABLE_VIEW_TYPE,
		});
	});
});
