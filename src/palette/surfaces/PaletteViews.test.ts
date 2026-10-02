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
	const plugin = { openNewPaletteView: vi.fn() } as unknown as MyPalettePlugin;
	return {
		list: new PaletteView(leaf, plugin),
		table: new PaletteTableView(leaf, plugin),
		plugin,
	};
}

describe("dedicated palette views", () => {
	it("opens the table directly with its own workspace identity before restoring any state", () => {
		const { list, table } = createViews();
		expect(list.getViewType()).toBe(PALETTE_VIEW_TYPE);
		expect(table.getViewType()).toBe(PALETTE_TABLE_VIEW_TYPE);
		expect(table.getState().displayMode).toBe("table");
		expect(table.getDisplayText()).toBe("My Palette Table");
		expect(table.getIcon()).toBe("table");
	});

	it("keeps registered presentations when restoring legacy layouts with conflicting mode flags", async () => {
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

	it("duplicates a table as a separate table, preserving the query, source pin, and sort priorities", async () => {
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
		expect(plugin.openNewPaletteView).toHaveBeenCalledWith(
			"project",
			"backlink",
			"Projects/Home.md",
			true,
			expect.objectContaining({
				columnOrder: ["prior", "name", "path", "modified"],
				hiddenColumns: ["path"],
				sorting: [
					{ id: "modified", desc: true },
					{ id: "name", desc: false },
				],
			}),
			PALETTE_TABLE_VIEW_TYPE,
		);
	});
});
