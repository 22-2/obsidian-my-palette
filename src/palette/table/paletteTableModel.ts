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
import { AUDIT_KINDS, type AuditKind } from "src/audit/vaultAudit";
import type { PaletteResult } from "src/palette/results";

const COLUMN_DEFINITIONS = {
	name: { label: "Name", width: 30 },
	path: { label: "Path", width: 38 },
	modified: { label: "Modified", width: 23 },
	prior: { label: "prior", width: 9 },
	size: { label: "Size", width: 12 },
	linkedFrom: { label: "Linked from", width: 14 },
	firstSource: { label: "First source", width: 38 },
	foldersInside: { label: "Folders inside", width: 14 },
	content: { label: "Content", width: 12 },
} as const;

export type PaletteTableColumnId = keyof typeof COLUMN_DEFINITIONS;

export interface PaletteTableColumn {
	id: PaletteTableColumnId;
	label: string;
	width: number;
}

/**
 * The columns a table shows depend on what it lists: `files` for ordinary searches, and one
 * set per Vault audit kind. Each set keeps its own order, hidden columns and sorting.
 */
export type PaletteTableColumnSetId = "files" | AuditKind;

function columnsOf(...ids: PaletteTableColumnId[]): PaletteTableColumn[] {
	return ids.map((id) => ({ id, ...COLUMN_DEFINITIONS[id] }));
}

export const PALETTE_TABLE_COLUMN_SETS: Readonly<
	Record<PaletteTableColumnSetId, readonly PaletteTableColumn[]>
> = {
	files: columnsOf("name", "path", "modified", "prior"),
	"orphaned-files": columnsOf("name", "path", "size", "modified"),
	// Why: Content tells blank notes from MOC-only ones, which the list marks the same way.
	"empty-files": columnsOf("name", "path", "modified", "content"),
	// Why: the Name column holds the link text here, so it is labeled for what it shows.
	"broken-links": [
		{ id: "name", label: "Link", width: COLUMN_DEFINITIONS.name.width },
		...columnsOf("linkedFrom", "firstSource"),
	],
	"empty-folders": columnsOf("name", "path", "foldersInside"),
};

export interface PaletteTableLayout {
	sorting: SortingState;
	columnOrder: PaletteTableColumnId[];
	hiddenColumns: PaletteTableColumnId[];
}

/**
 * The top-level layout is the `files` set, as stored before column sets existed, so older
 * workspace layouts keep working. The other sets are stored only once they have been shown.
 */
export interface PaletteTableState extends PaletteTableLayout {
	displayMode: "list" | "table";
	columnSets?: Partial<Record<AuditKind, PaletteTableLayout>>;
}

export interface PaletteTableRow {
	result: PaletteResult;
	name: string;
	path?: string;
	modified?: number;
	prior?: number;
	size?: number;
	linkedFrom?: number;
	firstSource?: string;
	foldersInside?: number;
	content?: string;
}

interface RawLayout {
	sorting?: unknown;
	columnOrder?: unknown;
	hiddenColumns?: unknown;
}

export function normalizePaletteTableState(
	state: RawLayout & { displayMode?: unknown; columnSets?: unknown },
): PaletteTableState {
	const rawSets =
		state.columnSets && typeof state.columnSets === "object"
			? (state.columnSets as Record<string, unknown>)
			: {};
	const columnSets: Partial<Record<AuditKind, PaletteTableLayout>> = {};
	for (const kind of AUDIT_KINDS) {
		const raw = rawSets[kind];
		if (raw && typeof raw === "object") columnSets[kind] = normalizeLayout(raw, kind);
	}
	return {
		displayMode: state.displayMode === "table" ? "table" : "list",
		...normalizeLayout(state, "files"),
		...(Object.keys(columnSets).length > 0 ? { columnSets } : {}),
	};
}

export function normalizeLayout(
	state: RawLayout,
	columnSet: PaletteTableColumnSetId,
): PaletteTableLayout {
	const supported = PALETTE_TABLE_COLUMN_SETS[columnSet].map(({ id }) => id);
	const isSupported = (id: unknown): id is PaletteTableColumnId =>
		supported.includes(id as PaletteTableColumnId);
	const seen = new Set<string>();
	const sorting: SortingState = [];
	// Workspace layouts can outlive column definitions. Ignore malformed or removed
	// columns so restoring a pane never sends an unknown column to the row model.
	if (Array.isArray(state.sorting)) {
		for (const item of state.sorting as Array<{ id?: unknown; desc?: unknown } | null>) {
			const id = item?.id;
			if (!isSupported(id) || typeof item?.desc !== "boolean" || seen.has(id)) continue;
			seen.add(id);
			sorting.push({ id, desc: item.desc });
		}
	}
	const savedOrder: unknown[] = Array.isArray(state.columnOrder) ? state.columnOrder : [];
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
	return { sorting, columnOrder, hiddenColumns };
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const features = tableFeatures({
	coreReactivityFeature: storeReactivityBindings(),
	rowSortingFeature,
	sortedRowModel: createSortedRowModel(),
});
const helper = createColumnHelper<typeof features, PaletteTableRow>();

function textColumn(id: "name" | "path" | "firstSource" | "content") {
	return helper.accessor(id, {
		sortFn: (a, b) => collator.compare(a.original[id] ?? "", b.original[id] ?? ""),
		sortDescFirst: false,
	});
}

function numberColumn(id: "modified" | "prior" | "size" | "linkedFrom" | "foldersInside") {
	return helper.accessor(id, {
		sortFn: sortFn_basic,
		sortDescFirst: true,
		sortUndefined: "last",
	});
}

// Why: the table knows every column; a column set only decides which ones are shown and
// sortable, so switching sets never rebuilds the table.
const columns = helper.columns([
	textColumn("name"),
	textColumn("path"),
	numberColumn("modified"),
	numberColumn("prior"),
	numberColumn("size"),
	numberColumn("linkedFrom"),
	textColumn("firstSource"),
	numberColumn("foldersInside"),
	textColumn("content"),
]);

/** Keep search ranking as the unsorted order; explicit column sorts override it. */
export class PaletteTableModel {
	private active: PaletteTableColumnSetId = "files";
	/** Order and hidden columns of every set; sorting of the inactive ones. */
	private readonly layouts = new Map<PaletteTableColumnSetId, PaletteTableLayout>();
	readonly table = constructTable({
		features,
		columns,
		data: [] as PaletteTableRow[],
		getRowId: (row) => row.result.id,
	});

	constructor(sorting: SortingState = []) {
		this.table.setSorting(normalizeLayout({ sorting }, "files").sorting);
	}

	get columnSet(): PaletteTableColumnSetId {
		return this.active;
	}

	/** Switches to another set, keeping the current one's sorting for when it returns. */
	setColumnSet(columnSet: PaletteTableColumnSetId): void {
		if (columnSet === this.active) return;
		this.layouts.set(this.active, this.layoutOf(this.active));
		this.active = columnSet;
		this.table.setSorting(this.layoutOf(columnSet, false).sorting);
	}

	/** Every set's layout, as saved in the workspace. */
	get state(): Omit<PaletteTableState, "displayMode"> {
		const columnSets: Partial<Record<AuditKind, PaletteTableLayout>> = {};
		for (const kind of AUDIT_KINDS) {
			if (kind === this.active || this.layouts.has(kind))
				columnSets[kind] = this.layoutOf(kind);
		}
		return {
			...this.layoutOf("files"),
			...(Object.keys(columnSets).length > 0 ? { columnSets } : {}),
		};
	}

	setState(state: Omit<PaletteTableState, "displayMode">): void {
		const normalized = normalizePaletteTableState(state);
		this.layouts.clear();
		this.layouts.set("files", normalizeLayout(normalized, "files"));
		for (const kind of AUDIT_KINDS) {
			const layout = normalized.columnSets?.[kind];
			if (layout) this.layouts.set(kind, layout);
		}
		this.table.setSorting(this.layoutOf(this.active, false).sorting);
	}

	setRows(rows: PaletteTableRow[]): void {
		this.table.setOptions((previous) => ({ ...previous, data: rows }));
	}

	get sorting(): SortingState {
		return this.table.store.state.sorting;
	}

	setSorting(sorting: SortingState): void {
		this.table.setSorting(normalizeLayout({ sorting }, this.active).sorting);
	}

	toggleSorting(id: PaletteTableColumnId): void {
		if (!this.columns.some((column) => column.id === id)) return;
		// Why: every header click cycles only that column while retaining the other
		// priorities, so multi-column sorting never requires a modifier key.
		this.table.getColumn(id)?.toggleSorting(undefined, true);
	}

	/** The columns of the active set, in their definition order. */
	get columns(): readonly PaletteTableColumn[] {
		return PALETTE_TABLE_COLUMN_SETS[this.active];
	}

	get columnLayout(): Pick<PaletteTableLayout, "columnOrder" | "hiddenColumns"> {
		const { columnOrder, hiddenColumns } = this.layoutOf(this.active);
		return { columnOrder: [...columnOrder], hiddenColumns: [...hiddenColumns] };
	}

	get visibleColumns(): PaletteTableColumn[] {
		const { columnOrder, hiddenColumns } = this.columnLayout;
		return columnOrder
			.filter((id) => !hiddenColumns.includes(id))
			.map((id) => this.columns.find((column) => column.id === id)!);
	}

	setColumnLayout(layout: Pick<PaletteTableLayout, "columnOrder" | "hiddenColumns">): void {
		const { columnOrder, hiddenColumns } = normalizeLayout(layout, this.active);
		this.layouts.set(this.active, { sorting: this.sorting, columnOrder, hiddenColumns });
	}

	moveColumn(
		id: PaletteTableColumnId,
		target: PaletteTableColumnId,
		position: "before" | "after",
	): void {
		if (id === target) return;
		const columnOrder = this.columnLayout.columnOrder.filter((column) => column !== id);
		const index = columnOrder.indexOf(target);
		if (index < 0) return;
		columnOrder.splice(index + (position === "after" ? 1 : 0), 0, id);
		this.setColumnLayout({ ...this.columnLayout, columnOrder });
	}

	toggleColumnVisibility(id: PaletteTableColumnId): void {
		if (id === "name") return;
		const { hiddenColumns } = this.columnLayout;
		const next = hiddenColumns.includes(id)
			? hiddenColumns.filter((column) => column !== id)
			: [...hiddenColumns, id];
		// Why: hiding a column changes presentation only; its active sort is
		// preserved when the column is shown again.
		this.setColumnLayout({ ...this.columnLayout, hiddenColumns: next });
	}

	sortedRows(): PaletteTableRow[] {
		// Why: return every match in sort order; the panel applies the shared result
		// limit, so a high-ranked value is never cut off before sorting.
		return this.table.getRowModel().rows.map((row) => row.original);
	}

	/**
	 * A set's stored layout; the active set's sorting lives in the table, so it is read from
	 * there unless the stored sorting is what the table is about to be set to.
	 */
	private layoutOf(columnSet: PaletteTableColumnSetId, liveSorting = true): PaletteTableLayout {
		const stored = this.layouts.get(columnSet) ?? normalizeLayout({}, columnSet);
		return liveSorting && columnSet === this.active
			? { ...stored, sorting: this.sorting }
			: stored;
	}
}
