import { describe, expect, it } from "vitest";
import {
	PaletteTableModel,
	normalizePaletteTableState,
	type PaletteTableRow,
} from "src/palette/table/paletteTableModel";

function row(
	name: string,
	modified?: number,
	prior?: number,
	path = `${name}.md`,
): PaletteTableRow {
	return {
		result: {
			id: path,
			mode: "file",
			primary: name,
			secondary: path,
			vaultPath: path,
			icon: "file",
		},
		name,
		path,
		modified,
		prior,
	};
}

function names(model: PaletteTableModel, index = 0, size = 50): string[] {
	return model.page(index, size).map((item) => item.name);
}

describe("PaletteTableModel", () => {
	it("sorts all matches before paging, including records past the original display limit", () => {
		const model = new PaletteTableModel([{ id: "modified", desc: true }]);
		model.setRows(Array.from({ length: 120 }, (_, index) => row(`Note ${index}`, index)));
		expect(names(model).at(0)).toBe("Note 119");
		expect(names(model).at(-1)).toBe("Note 70");
		expect(names(model, 2)).toHaveLength(20);
		expect(names(model, 2).at(-1)).toBe("Note 0");
	});

	it("uses multiple column priorities and changes their precedence independently of direction", () => {
		const model = new PaletteTableModel([
			{ id: "prior", desc: true },
			{ id: "modified", desc: true },
		]);
		model.setRows([row("High old", 10, 2), row("Low new", 30, 1), row("High new", 20, 2)]);
		expect(names(model)).toEqual(["High new", "High old", "Low new"]);
		model.movePriority("modified", -1);
		expect(names(model)).toEqual(["Low new", "High new", "High old"]);
		expect(model.sorting).toEqual([
			{ id: "modified", desc: true },
			{ id: "prior", desc: true },
		]);
	});

	it.each([false, true])("places missing metadata last when descending is %s", (desc) => {
		const model = new PaletteTableModel([{ id: "prior", desc }]);
		model.setRows([row("Missing"), row("Zero", 0, 0), row("Negative", 0, -2)]);
		expect(names(model)).toEqual(
			desc ? ["Zero", "Negative", "Missing"] : ["Negative", "Zero", "Missing"],
		);
	});

	it("restores search ranking when sorting is cleared and retains it for ties", () => {
		const model = new PaletteTableModel([{ id: "prior", desc: true }]);
		model.setRows([row("Second", 5, 1), row("First", 5, 1)]);
		expect(names(model)).toEqual(["Second", "First"]);
		model.setSorting([{ id: "name", desc: false }]);
		expect(names(model)).toEqual(["First", "Second"]);
		model.setSorting([]);
		expect(names(model)).toEqual(["Second", "First"]);
	});

	it("supports header cycling, additive sorts, and replacing sorts", () => {
		const model = new PaletteTableModel();
		model.setRows([row("Note 10", 1), row("Note 2", 2)]);
		model.toggleSorting("name");
		expect(names(model)).toEqual(["Note 2", "Note 10"]);
		model.toggleSorting("modified", true);
		expect(model.sorting).toEqual([
			{ id: "name", desc: false },
			{ id: "modified", desc: true },
		]);
		model.toggleSorting("name");
		expect(model.sorting).toEqual([{ id: "name", desc: true }]);
		model.toggleSorting("name");
		expect(model.sorting).toEqual([]);
	});

	it("reapplies the current sort to new search results without changing the original arrays", () => {
		const model = new PaletteTableModel([{ id: "name", desc: false }]);
		const rows = [row("Zulu"), row("Alpha")];
		model.setRows(rows);
		expect(names(model)).toEqual(["Alpha", "Zulu"]);
		expect(rows.map((item) => item.name)).toEqual(["Zulu", "Alpha"]);
		model.setRows([row("Gamma"), row("Beta")]);
		expect(names(model)).toEqual(["Beta", "Gamma"]);
	});
});

describe("normalizePaletteTableState", () => {
	it("restores supported priorities in order and discards malformed, removed, and duplicate columns", () => {
		expect(
			normalizePaletteTableState({
				displayMode: "table",
				sorting: [
					{ id: "prior", desc: true },
					{ id: "deleted", desc: false },
					null,
					"name",
					{ id: "name", desc: "false" },
					{ id: "prior", desc: false },
					{ id: "name", desc: false },
				],
			}),
		).toEqual({
			displayMode: "table",
			sorting: [
				{ id: "prior", desc: true },
				{ id: "name", desc: false },
			],
		});
	});

	it("keeps old workspace layouts in list mode with search ranking", () => {
		expect(normalizePaletteTableState({})).toEqual({ displayMode: "list", sorting: [] });
		expect(normalizePaletteTableState({ displayMode: "removed", sorting: {} })).toEqual({
			displayMode: "list",
			sorting: [],
		});
	});
});
