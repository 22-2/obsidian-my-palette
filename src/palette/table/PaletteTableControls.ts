import { Component, TFile, setTooltip, type App } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import type { AuditResult, PaletteResult } from "src/palette/results";
import { emptyFileLabel } from "src/audit/noteEmptiness";
import {
	PaletteTableModel,
	normalizePaletteTableState,
	type PaletteTableColumnSetId,
	type PaletteTableRow,
	type PaletteTableState,
	type PaletteTableColumnId,
} from "src/palette/table/paletteTableModel";
import { formatSize } from "src/shared/fileSize";
import { normalizeFrontmatterPrior } from "src/shared/frontmatter";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";
import type { SuggestionPanel, SuggestionPanelResults } from "src/ui/suggestionPanel";
import { t } from "src/i18n";
import type { PaletteSort } from "src/palette/paletteSorting";

interface PaletteTableControlsOptions {
	initialState: PaletteTableState;
	presentation: (result: PaletteResult) => SelectionItem;
	/** 名前の列の強調で、ひらがなとカタカナを同じ文字として扱うかどうか。 */
	foldKana: () => boolean;
	onChange: (state: PaletteTableState) => void;
	/** 現在の結果に必要な列。新しい結果が届くたびに読む。 */
	columnSet: () => PaletteTableColumnSetId;
}

/** ペインごとの表の表示。検索の一致は、引き続き検索のプロバイダーが持つ。 */
export class PaletteTableControls extends Component {
	private readonly model: PaletteTableModel;
	private readonly dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
	private results: SuggestionPanelResults<PaletteResult> = { items: [] };
	private rowsByResult = new Map<PaletteResult, PaletteTableRow>();
	private draggedColumn?: PaletteTableColumnId;
	private dragEndedAt = 0;
	private columnMenu?: PaletteMenu;

	constructor(
		private readonly panel: SuggestionPanel<PaletteResult>,
		private readonly app: App,
		private readonly options: PaletteTableControlsOptions,
	) {
		super();
		this.model = new PaletteTableModel();
		this.model.setState(normalizePaletteTableState(options.initialState));
	}

	onload(): void {
		this.registerDomEvent(this.panel.resultContainerEl, "click", (event) => {
			const button = this.buttonAtEvent(event);
			if (!button || button.dataset.action !== "sort") return;
			event.preventDefault();
			event.stopPropagation();
			// Why: 一部のホストは、ネイティブのドラッグの後にポインターのクリックを出す。
			// 並べ替えの位置変更が、誤って並べ替えを切り替えないようにする。キーボードの操作は引き続き動く。
			if (event.detail > 0 && Date.now() - this.dragEndedAt < 250) return;
			const column = this.model.columns.find(({ id }) => id === button.dataset.column);
			if (!column) return;
			this.model.toggleSorting(column.id);
			this.changed();
			this.panel.resultContainerEl
				.querySelector<HTMLButtonElement>(`button[data-column="${column.id}"]`)
				?.focus({ preventScroll: true });
		});
		this.registerDomEvent(this.panel.resultContainerEl, "contextmenu", (event) => {
			if (!this.headerAtEvent(event)) return;
			event.preventDefault();
			event.stopPropagation();
			this.showColumnMenu(event);
		});
		this.registerDomEvent(this.panel.resultContainerEl, "dragstart", (event) => {
			const header = this.headerAtEvent(event);
			const column = this.model.columns.find(({ id }) => id === header?.dataset.column);
			if (!header || !column || !event.dataTransfer) return;
			this.draggedColumn = column.id;
			this.columnMenu?.close();
			event.dataTransfer.effectAllowed = "move";
			event.dataTransfer.setData("text/plain", column.id);
			header.addClass("is-dragging");
			event.stopPropagation();
		});
		this.registerDomEvent(this.panel.resultContainerEl, "dragover", (event) => {
			const header = this.headerAtEvent(event);
			if (!this.draggedColumn || !header) return;
			event.preventDefault();
			event.stopPropagation();
			if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
			this.clearDropMarkers();
			header.dataset.dropPosition = this.dropPosition(header, event);
		});
		this.registerDomEvent(this.panel.resultContainerEl, "dragleave", (event) => {
			const header = this.headerAtEvent(event);
			const relatedTarget = event.relatedTarget as Node | null;
			if (header && !(relatedTarget?.instanceOf(Node) && header.contains(relatedTarget))) {
				delete header.dataset.dropPosition;
			}
		});
		this.registerDomEvent(this.panel.resultContainerEl, "drop", (event) => {
			const header = this.headerAtEvent(event);
			const target = this.model.columns.find(({ id }) => id === header?.dataset.column);
			if (!this.draggedColumn || !header || !target) return;
			event.preventDefault();
			event.stopPropagation();
			this.model.moveColumn(this.draggedColumn, target.id, this.dropPosition(header, event));
			this.endColumnDrag();
			this.changed();
		});
		this.registerDomEvent(this.panel.resultContainerEl, "dragend", () => this.endColumnDrag());
	}

	onunload(): void {
		this.columnMenu?.close();
		this.endColumnDrag();
	}

	getState(): PaletteTableState {
		return { displayMode: "table", ...structuredClone(this.model.state) };
	}

	getSort(): PaletteSort | undefined {
		const sort = this.model.sorting[0];
		if (
			!sort ||
			(sort.id !== "name" &&
				sort.id !== "path" &&
				sort.id !== "modified" &&
				sort.id !== "prior")
		)
			return undefined;
		return { key: sort.id, desc: sort.desc };
	}

	setSort(sort?: PaletteSort): void {
		const supported =
			sort &&
			(sort.key === "name" ||
				sort.key === "path" ||
				sort.key === "modified" ||
				sort.key === "prior");
		this.model.setSorting(supported ? [{ id: sort.key, desc: sort.desc }] : []);
		this.changed();
	}

	setState(state: PaletteTableState): void {
		this.model.setState(normalizePaletteTableState(state));
		this.render();
	}

	setResults(results: SuggestionPanelResults<PaletteResult>): void {
		this.model.setColumnSet(this.options.columnSet());
		if (results.items !== this.results.items) {
			const rows = results.items.map((result) => this.toRow(result));
			this.rowsByResult = new Map(rows.map((row) => [row.result, row]));
			this.model.setRows(rows);
		}
		this.results = results;
		this.render();
	}

	private toRow(result: PaletteResult): PaletteTableRow {
		if (result.mode === "audit") return this.toAuditRow(result);
		const candidate =
			"file" in result
				? result.file
				: result.mode === "everything" && result.vaultPath
					? this.app.vault.getAbstractFileByPath(result.vaultPath)
					: undefined;
		const file = candidate instanceof TFile ? candidate : undefined;
		const modified =
			result.mode === "file" ? (result.mtime ?? file?.stat.mtime) : file?.stat.mtime;
		const prior =
			result.mode === "file"
				? result.prior
				: file
					? normalizeFrontmatterPrior(
							this.app.metadataCache.getFileCache(file)?.frontmatter?.prior,
						)
					: undefined;
		return {
			result,
			name: result.primary,
			path: result.secondary,
			// Why: 欠けているメタデータは undefined のまま残す。0 にすると、実際のタイムスタンプや
			// 負の prior の値より前に並んでしまうため。
			modified:
				typeof modified === "number" && Number.isFinite(modified) ? modified : undefined,
			prior,
		};
	}

	private toAuditRow(result: AuditResult): PaletteTableRow {
		const row = { result, name: result.primary };
		switch (result.kind) {
			case "orphaned-files":
			case "empty-files":
				return {
					...row,
					path: result.file.path,
					size: result.size,
					modified: result.file.stat.mtime,
					...(result.kind === "empty-files"
						? { content: emptyFileLabel(result.mocOnly) }
						: {}),
				};
			case "broken-links":
				return {
					...row,
					linkedFrom: new Set(result.sources.map(({ path }) => path)).size,
					firstSource: result.sources[0]?.path,
				};
			case "empty-folders":
				return { ...row, path: result.folderPath, foldersInside: result.foldersInside };
		}
	}

	private render(): void {
		// Why: 表示の形は PaletteTableView だけが決める。保存された古い状態が、
		// 表示の切り替えを再び持ち込めないようにするため。
		this.panel.setAttribute("data-result-layout", "table");
		this.panel.setResultsLayout({
			render: (container, items, query, decorateRow) =>
				this.renderTable(container, items, query, decorateRow),
		});
		// Why: 並べ替えた一致をすべて渡す。パネルはリストの表示と同じ件数の上限と件数の表示を適用する。
		this.panel.setResults({
			...this.results,
			items: this.model.sortedRows().map((row) => row.result),
			total: this.results.total ?? this.results.items.length,
		});
	}

	private renderTable(
		container: HTMLElement,
		items: readonly PaletteResult[],
		query: string,
		decorateRow: (row: HTMLElement, index: number) => void,
	): void {
		const table = container.createEl("table", {
			cls: "my-palette-results-table",
			attr: { role: "grid", "aria-multiselectable": "true" },
		});
		const head = table.createEl("thead").createEl("tr");
		const visibleColumns = this.model.visibleColumns;
		const totalWidth = visibleColumns.reduce((total, column) => total + column.width, 0);
		// Why: 幅は列の位置ではなく列の識別子に従う。非表示の列は、不必要に広い表を保つ代わりに
		// 占めていた幅を手放す。
		table.style.minWidth = `${Math.max(260, totalWidth * 7.4)}px`;
		for (const column of visibleColumns) {
			const th = head.createEl("th", {
				attr: {
					scope: "col",
					"data-column": column.id,
					draggable: "true",
				},
			});
			th.style.width = `${(column.width / totalWidth) * 100}%`;
			const index = this.model.sorting.findIndex((sort) => sort.id === column.id);
			const sort = this.model.sorting[index];
			if (sort)
				th.setAttribute(
					"aria-sort",
					index === 0 ? (sort.desc ? "descending" : "ascending") : "other",
				);
			const button = this.button(
				th,
				"sort",
				t("table.sortTitle", { label: column.label }),
				column.id,
			);
			button.setText(`${column.label}${sort ? ` ${sort.desc ? "↓" : "↑"}${index + 1}` : ""}`);
		}
		const body = table.createEl("tbody");
		for (const [index, result] of items.entries()) {
			const row = body.createEl("tr");
			decorateRow(row, index);
			const data = this.rowsByResult.get(result);
			// Why: ヘッダーとセルを同じ表示順から描く。列を隠したり動かしたりしても、
			// ほかの列の値が見出しの下に残らないようにするため。
			for (const column of visibleColumns) {
				const cell = row.createEl("td", { attr: { "data-column": column.id } });
				this.renderCell(cell, column.id, result, data, query);
			}
		}
	}

	private renderCell(
		cell: HTMLElement,
		column: PaletteTableColumnId,
		result: PaletteResult,
		data: PaletteTableRow | undefined,
		query: string,
	): void {
		switch (column) {
			case "name": {
				const presentation = this.options.presentation(result);
				renderSelectionItem({ ...presentation, description: undefined }, cell, query, {
					foldKana: this.options.foldKana(),
				});
				return;
			}
			case "path":
			case "firstSource":
			case "content": {
				const text = data?.[column] ?? "—";
				cell.setText(text);
				setTooltip(cell, text);
				return;
			}
			case "modified":
				cell.setText(
					data?.modified === undefined ? "—" : this.dateFormat.format(data.modified),
				);
				return;
			case "size":
				cell.setText(data?.size === undefined ? "—" : formatSize(data.size));
				return;
			case "prior":
			case "linkedFrom":
			case "foldersInside": {
				const value = data?.[column];
				cell.setText(value === undefined ? "—" : String(value));
				return;
			}
		}
	}

	private showColumnMenu(event: MouseEvent): void {
		this.columnMenu?.close();
		const menu = new PaletteMenu();
		this.columnMenu = menu;
		const { hiddenColumns } = this.model.columnLayout;
		for (const column of this.model.columns) {
			menu.addItem((item) =>
				item
					.setTitle(column.label)
					.setChecked(!hiddenColumns.includes(column.id))
					.setDisabled(column.id === "name")
					.onClick(() => {
						this.model.toggleColumnVisibility(column.id);
						this.changed();
					}),
			);
		}
		showMenuAtEvent(menu, event);
	}

	private headerAtEvent(event: Event): HTMLElement | undefined {
		const target = event.target as Node | null;
		// Why: ワークスペースを復元したあとは、ポップアウトのヘッダーは別の DOM の領域に属する。
		return target?.instanceOf(Element)
			? (target.closest<HTMLElement>("th[data-column]") ?? undefined)
			: undefined;
	}

	private dropPosition(header: HTMLElement, event: DragEvent): "before" | "after" {
		const bounds = header.getBoundingClientRect();
		return event.clientX < bounds.left + bounds.width / 2 ? "before" : "after";
	}

	private clearDropMarkers(): void {
		for (const header of this.panel.resultContainerEl.querySelectorAll<HTMLElement>(
			"th[data-drop-position]",
		)) {
			delete header.dataset.dropPosition;
		}
	}

	private endColumnDrag(): void {
		if (this.draggedColumn) this.dragEndedAt = Date.now();
		this.draggedColumn = undefined;
		this.clearDropMarkers();
		for (const header of this.panel.resultContainerEl.querySelectorAll<HTMLElement>(
			"th.is-dragging",
		)) {
			header.removeClass("is-dragging");
		}
	}

	private changed(): void {
		this.render();
		this.options.onChange(this.getState());
	}

	private buttonAtEvent(event: MouseEvent): HTMLButtonElement | undefined {
		const target = event.target as Node | null;
		// Why: ポップアウトのウィンドウで作られたボタンも、並べ替えとして認識する必要がある。
		return target?.instanceOf(Element)
			? (target.closest<HTMLButtonElement>("button[data-action]") ?? undefined)
			: undefined;
	}

	private button(
		container: HTMLElement,
		action: string,
		title: string,
		column: string,
	): HTMLButtonElement {
		return container.createEl("button", {
			cls: "my-palette-table-button",
			attr: {
				type: "button",
				"aria-label": title,
				"data-action": action,
				"data-column": column,
			},
		});
	}
}
