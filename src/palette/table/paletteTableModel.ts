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

// Why: keep table rendering, page navigation, and row selection at 50 rows.
export const PALETTE_TABLE_PAGE_SIZE = 50;

export const PALETTE_TABLE_COLUMNS = [
	{ id: "name", label: "Name", width: 30 },
	{ id: "path", label: "Path", width: 38 },
	{ id: "modified", label: "Modified", width: 23 },
	{ id: "prior", label: "prior", width: 9 },
] as const;

export type PaletteTableColumnId = (typeof PALETTE_TABLE_COLUMNS)[number]["id"];

export interface PaletteTableState {
	displayMode: "list" | "table";
	sorting: SortingState;
	columnOrder: PaletteTableColumnId[];
	hiddenColumns: PaletteTableColumnId[];
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
	columnOrder?: unknown;
	hiddenColumns?: unknown;
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
	const supported = PALETTE_TABLE_COLUMNS.map(({ id }) => id);
	const savedOrder = Array.isArray(state.columnOrder) ? state.columnOrder : [];
	const columnOrder = supported.filter((id) => savedOrder.includes(id));
	// Why: preserve the saved order, discard removed/duplicate columns, and append
	// new columns so older workspace layouts remain complete after an upgrade.
	columnOrder.sort((a, b) => savedOrder.indexOf(a) - savedOrder.indexOf(b));
	columnOrder.push(...supported.filter((id) => !columnOrder.includes(id)));
	// Why: Name identifies selectable results and keeps a header available for
	// restoring hidden columns, matching the Plugin Manager's visibility menu.
	const hiddenColumns = supported.filter(
		(id) =>
			id !== "name" && Array.isArray(state.hiddenColumns) && state.hiddenColumns.includes(id),
	);
	return {
		displayMode: state.displayMode === "table" ? "table" : "list",
		sorting,
		columnOrder,
		hiddenColumns,
	};
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
	private columnState: Pick<PaletteTableState, "columnOrder" | "hiddenColumns"> =
		normalizePaletteTableState({});
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

	toggleSorting(id: PaletteTableColumnId): void {
		// Why: every header click cycles only that column while retaining the other
		// priorities, so multi-column sorting never requires a modifier key.
		this.table.getColumn(id)?.toggleSorting(undefined, true);
	}

	get columnLayout(): Pick<PaletteTableState, "columnOrder" | "hiddenColumns"> {
		return {
			columnOrder: [...this.columnState.columnOrder],
			hiddenColumns: [...this.columnState.hiddenColumns],
		};
	}

	get visibleColumns(): (typeof PALETTE_TABLE_COLUMNS)[number][] {
		return this.columnState.columnOrder
			.filter((id) => !this.columnState.hiddenColumns.includes(id))
			.map((id) => PALETTE_TABLE_COLUMNS.find((column) => column.id === id)!);
	}

	setColumnLayout(layout: Pick<PaletteTableState, "columnOrder" | "hiddenColumns">): void {
		this.columnState = normalizePaletteTableState(layout);
	}

	moveColumn(
		id: PaletteTableColumnId,
		target: PaletteTableColumnId,
		position: "before" | "after",
	): void {
		if (id === target) return;
		const columnOrder = this.columnState.columnOrder.filter((column) => column !== id);
		const index = columnOrder.indexOf(target);
		if (index < 0) return;
		columnOrder.splice(index + (position === "after" ? 1 : 0), 0, id);
		this.setColumnLayout({ ...this.columnLayout, columnOrder });
	}

	toggleColumnVisibility(id: PaletteTableColumnId): void {
		if (id === "name") return;
		const hiddenColumns = this.columnState.hiddenColumns.includes(id)
			? this.columnState.hiddenColumns.filter((column) => column !== id)
			: [...this.columnState.hiddenColumns, id];
		// Why: hiding a column changes presentation only; its active sort remains
		// editable in the priority bar and is preserved when the column is shown.
		this.setColumnLayout({ ...this.columnLayout, hiddenColumns });
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
