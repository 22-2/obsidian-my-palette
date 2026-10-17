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
import { t } from "src/i18n";

const COLUMN_DEFINITIONS = {
	name: { label: t("table.col.name"), width: 30 },
	path: { label: t("table.col.path"), width: 38 },
	modified: { label: t("table.col.modified"), width: 23 },
	prior: { label: t("table.col.prior"), width: 9 },
	size: { label: t("table.col.size"), width: 12 },
	linkedFrom: { label: t("table.col.linkedFrom"), width: 14 },
	firstSource: { label: t("table.col.firstSource"), width: 38 },
	foldersInside: { label: t("table.col.foldersInside"), width: 14 },
	content: { label: t("table.col.content"), width: 12 },
} as const;

export type PaletteTableColumnId = keyof typeof COLUMN_DEFINITIONS;

export interface PaletteTableColumn {
	id: PaletteTableColumnId;
	label: string;
	width: number;
}

/**
 * 表が示す列は、何を一覧にしているかで決まる。通常の検索では `files`、Vault 監査の種類ごとに1組ずつ。
 * 組ごとに、列の順序、非表示の列、並べ替えを独立して保つ。
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
	// Why: 内容の列で、空のノートと MOC だけのノートを区別する。一覧ではどちらも同じ印を付ける。
	"empty-files": columnsOf("name", "path", "modified", "content"),
	// Why: ここでは名前の列にリンクの文字列が入るので、表示する内容に合わせてラベルを付ける。
	"broken-links": [
		{ id: "name", label: t("table.col.link"), width: COLUMN_DEFINITIONS.name.width },
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
 * 最上位のレイアウトは `files` の組。列の組が生まれる前に保存されていた形のままなので、
 * 古いワークスペースのレイアウトも動き続ける。ほかの組は、表示されてから初めて保存する。
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
	// Why: ワークスペースのレイアウトは、列の定義より長く残ることがある。不正な列や削除された列は
	// 無視し、ペインを復元しても未知の列が行のモデルに渡らないようにする。
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
	// Why: 保存された順序は保ち、削除された列や重複する列は捨て、新しい列は末尾に足す。
	// アップグレード後も、古いワークスペースのレイアウトが完全なままになるように。
	columnOrder.sort((a, b) => savedOrder.indexOf(a) - savedOrder.indexOf(b));
	columnOrder.push(...supported.filter((id) => !columnOrder.includes(id)));
	// Why: 名前は選択できる結果を特定し、非表示の列を戻すためのヘッダーを残す。
	// プラグインマネージャーの表示メニューに合わせるため。
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

// Why: 表はすべての列を知っている。列の組は、どの列を表示し並べ替えられるかだけを決めるので、
// 組を切り替えても表は作り直さない。
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

/** 並べ替えていない順序では検索の順位を保つ。列の明示的な並べ替えがそれを上書きする。 */
export class PaletteTableModel {
	private active: PaletteTableColumnSetId = "files";
	/** すべての組の列の順序と非表示の列。非アクティブな組の並べ替え。 */
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

	/** 別の組に切り替える。現在の組の並べ替えは、戻ってきたときのために残す。 */
	setColumnSet(columnSet: PaletteTableColumnSetId): void {
		if (columnSet === this.active) return;
		this.layouts.set(this.active, this.layoutOf(this.active));
		this.active = columnSet;
		this.table.setSorting(this.layoutOf(columnSet, false).sorting);
	}

	/** すべての組のレイアウト。ワークスペースに保存される形。 */
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
		// Why: ヘッダーをクリックするたびに、その列だけを切り替え、ほかの優先順位は保つ。
		// そうすれば、複数列の並べ替えに修飾キーが要らない。
		this.table.getColumn(id)?.toggleSorting(undefined, true);
	}

	/** アクティブな組の列を、定義の順で返す。 */
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
		// Why: 列を隠すのは表示の変更だけ。その列の並べ替えは、再び表示したときに保たれる。
		this.setColumnLayout({ ...this.columnLayout, hiddenColumns: next });
	}

	sortedRows(): PaletteTableRow[] {
		// Why: 並べ替えた順に、一致したものをすべて返す。上位の値が並べ替えの前に切り捨てられないよう、
		// 共通の件数の上限はパネルが適用する。
		return this.table.getRowModel().rows.map((row) => row.original);
	}

	/**
	 * 組の保存されたレイアウト。アクティブな組の並べ替えは表に入っているので、保存された並べ替えを
	 * 表に設定しようとしているのでなければ、そこから読む。
	 */
	private layoutOf(columnSet: PaletteTableColumnSetId, liveSorting = true): PaletteTableLayout {
		const stored = this.layouts.get(columnSet) ?? normalizeLayout({}, columnSet);
		return liveSorting && columnSet === this.active
			? { ...stored, sorting: this.sorting }
			: stored;
	}
}
