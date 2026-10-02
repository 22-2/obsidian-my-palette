import {
	constructTable,
	createColumnHelper,
	createSortedRowModel,
	rowSortingFeature,
	sortFn_basic,
	tableFeatures,
	type SortingState,
} from "@tanstack/table-core";
import { storeReactivityBindings } from "@tanstack/table-core/store-reactivity-bindings";
import type { PaletteResult } from "src/palette/results";

export const PALETTE_TABLE_COLUMNS = [
	{ id: "name", label: "Name" },
	{ id: "path", label: "Path" },
	{ id: "modified", label: "Modified" },
	{ id: "prior", label: "prior" },
] as const;

export type PaletteTableColumnId = (typeof PALETTE_TABLE_COLUMNS)[number]["id"];

export interface PaletteTableState {
	displayMode: "list" | "table";
	sorting: SortingState;
}

export interface PaletteTableRow {
	result: PaletteResult;
	name: string;
	path: string;
	modified?: number;
	prior?: number;
}

export function normalizePaletteTableState(state: {
	displayMode?: unknown;
	sorting?: unknown;
}): PaletteTableState {
	const seen = new Set<string>();
	const sorting: SortingState = [];
	// Workspace layouts can outlive column definitions. Ignore malformed or removed
	// columns so restoring a pane never sends an unknown column to the row model.
	if (Array.isArray(state.sorting)) {
		for (const item of state.sorting) {
			if (
				!item ||
				typeof item !== "object" ||
				!PALETTE_TABLE_COLUMNS.some(({ id }) => id === item.id) ||
				typeof item.desc !== "boolean" ||
				seen.has(item.id)
			)
				continue;
			seen.add(item.id);
			sorting.push({ id: item.id, desc: item.desc });
		}
	}
	return { displayMode: state.displayMode === "table" ? "table" : "list", sorting };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const features = tableFeatures({
	coreReactivityFeature: storeReactivityBindings(),
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, PaletteTableRow>();
const columns = helper.columns([
	helper.accessor("name", {
		sortFn: (a, b) => collator.compare(a.original.name, b.original.name),
		sortDescFirst: false,
	}),
	helper.accessor("path", {
		sortFn: (a, b) => collator.compare(a.original.path, b.original.path),
		sortDescFirst: false,
	}),
	helper.accessor("modified", {
		sortFn: sortFn_basic,
		sortDescFirst: true,
		sortUndefined: "last",
	}),
	helper.accessor("prior", {
		sortFn: sortFn_basic,
		sortDescFirst: true,
		sortUndefined: "last",
	}),
]);

/** Keep search ranking as the unsorted order; explicit column sorts override it. */
export class PaletteTableModel {
	readonly table = constructTable({
		features,
		columns,
		data: [] as PaletteTableRow[],
		getRowId: (row) => row.result.id,
	});

	constructor(sorting: SortingState = []) {
		this.table.setSorting(normalizePaletteTableState({ sorting }).sorting);
	}

	setRows(rows: PaletteTableRow[]): void {
		this.table.setOptions((previous) => ({ ...previous, data: rows }));
	}

	get sorting(): SortingState {
		return this.table.store.state.sorting;
	}

	setSorting(sorting: SortingState): void {
		this.table.setSorting(normalizePaletteTableState({ sorting }).sorting);
	}

	toggleSorting(id: PaletteTableColumnId, multi = false): void {
		this.table.getColumn(id)?.toggleSorting(undefined, multi);
	}

	movePriority(id: string, offset: -1 | 1): void {
		const sorting = [...this.sorting];
		const index = sorting.findIndex((sort) => sort.id === id);
		const target = index + offset;
		if (index < 0 || target < 0 || target >= sorting.length) return;
		const [sort] = sorting.splice(index, 1);
		sorting.splice(target, 0, sort);
		this.setSorting(sorting);
	}

	page(index: number, size: number): PaletteTableRow[] {
		// Sort every returned match before slicing, otherwise a high-ranked value
		// beyond the old 50-row display limit could never reach the first page.
		return this.table
			.getRowModel()
			.rows.slice(index * size, (index + 1) * size)
			.map((row) => row.original);
	}
}
