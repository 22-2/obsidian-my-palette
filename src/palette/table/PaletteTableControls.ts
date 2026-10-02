import { Component, Menu, TFile, setIcon, type App } from "obsidian";
import type { PaletteResult } from "src/palette/results";
import {
	PALETTE_TABLE_COLUMNS,
	PALETTE_TABLE_PAGE_SIZE,
	PaletteTableModel,
	normalizePaletteTableState,
	type PaletteTableRow,
	type PaletteTableState,
	type PaletteTableColumnId,
} from "src/palette/table/paletteTableModel";
import { normalizeFrontmatterPrior } from "src/shared/frontmatter";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";
import type { SuggestionPanel, SuggestionPanelResults } from "src/ui/suggestionPanel";

interface PaletteTableControlsOptions {
	initialState: PaletteTableState;
	presentation: (result: PaletteResult) => SelectionItem;
	onChange: (state: PaletteTableState) => void;
}

/** A per-pane table presentation; search providers continue to own matching. */
export class PaletteTableControls extends Component {
	private readonly model: PaletteTableModel;
	private readonly controlsEl: HTMLElement;
	private readonly toolbarEl: HTMLElement;
	private readonly dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
	private pageIndex = 0;
	private results: SuggestionPanelResults<PaletteResult> = { items: [] };
	private rowsByResult = new Map<PaletteResult, PaletteTableRow>();
	private draggedColumn?: PaletteTableColumnId;
	private dragEndedAt = 0;
	private columnMenu?: Menu;

	constructor(
		private readonly panel: SuggestionPanel<PaletteResult>,
		private readonly app: App,
		private readonly options: PaletteTableControlsOptions,
	) {
		super();
		this.model = new PaletteTableModel(options.initialState.sorting);
		this.model.setColumnLayout(normalizePaletteTableState(options.initialState));
		this.controlsEl = createDiv({ cls: "my-palette-table-controls" });
		panel.resultContainerEl.before(this.controlsEl);
		this.toolbarEl = this.controlsEl.createDiv("my-palette-table-toolbar");
	}

	onload(): void {
		this.registerDomEvent(this.controlsEl, "click", (event) => this.handleControlClick(event));
		this.registerDomEvent(this.panel.resultContainerEl, "click", (event) => {
			const button = this.buttonAtEvent(event);
			if (!button || button.dataset.action !== "sort") return;
			event.preventDefault();
			event.stopPropagation();
			// Why: some hosts emit a pointer click after a native drag. Do not let
			// reordering accidentally cycle sorting; keyboard activation still works.
			if (event.detail > 0 && Date.now() - this.dragEndedAt < 250) return;
			const column = PALETTE_TABLE_COLUMNS.find(({ id }) => id === button.dataset.column);
			if (!column) return;
			this.model.toggleSorting(column.id);
			this.pageIndex = 0;
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
			const column = PALETTE_TABLE_COLUMNS.find(({ id }) => id === header?.dataset.column);
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
			if (
				header &&
				!(event.relatedTarget instanceof Node && header.contains(event.relatedTarget))
			) {
				delete header.dataset.dropPosition;
			}
		});
		this.registerDomEvent(this.panel.resultContainerEl, "drop", (event) => {
			const header = this.headerAtEvent(event);
			const target = PALETTE_TABLE_COLUMNS.find(({ id }) => id === header?.dataset.column);
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
		this.controlsEl.remove();
	}

	getState(): PaletteTableState {
		return {
			displayMode: "table",
			sorting: this.model.sorting.map((sort) => ({ ...sort })),
			...this.model.columnLayout,
		};
	}

	setState(state: PaletteTableState): void {
		const next = normalizePaletteTableState(state);
		this.model.setSorting(next.sorting);
		this.model.setColumnLayout(next);
		this.pageIndex = 0;
		this.render();
	}

	setResults(results: SuggestionPanelResults<PaletteResult>): void {
		if (results.items !== this.results.items) {
			this.pageIndex = 0;
			const rows = results.items.map((result) => this.toRow(result));
			this.rowsByResult = new Map(rows.map((row) => [row.result, row]));
			this.model.setRows(rows);
		}
		this.results = results;
		this.render();
	}

	private toRow(result: PaletteResult): PaletteTableRow {
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
			// Missing metadata remains undefined, rather than becoming zero and
			// sorting ahead of real timestamps or negative prior values.
			modified:
				typeof modified === "number" && Number.isFinite(modified) ? modified : undefined,
			prior,
		};
	}

	private render(): void {
		// Why: the presentation belongs exclusively to PaletteTableView, so
		// persisted legacy state cannot reintroduce a mode toggle.
		this.panel.setAttribute("data-result-layout", "table");
		this.renderToolbar();
		this.panel.setResultsLayout({
			render: (container, items, query, decorateRow) =>
				this.renderTable(container, items, query, decorateRow),
		});
		const items = this.model
			.page(this.pageIndex, PALETTE_TABLE_PAGE_SIZE)
			.map((row) => row.result);
		this.panel.setResults({
			...this.results,
			items,
			total: this.results.total ?? this.results.items.length,
		});
		const start = items.length ? this.pageIndex * PALETTE_TABLE_PAGE_SIZE + 1 : 0;
		const end = this.pageIndex * PALETTE_TABLE_PAGE_SIZE + items.length;
		this.panel.resultCountEl.setText(
			`${start}–${end} / ${this.results.total ?? this.results.items.length}`,
		);
	}

	private renderToolbar(): void {
		this.toolbarEl.empty();
		const pager = this.toolbarEl.createDiv("my-palette-table-pager");
		const pages = Math.max(1, Math.ceil(this.results.items.length / PALETTE_TABLE_PAGE_SIZE));
		this.button(pager, "previous", "Previous page", "chevron-left").disabled =
			this.pageIndex === 0;
		pager.createSpan({ text: `${this.pageIndex + 1} / ${pages}` });
		this.button(pager, "next", "Next page", "chevron-right").disabled =
			this.pageIndex + 1 >= pages;
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
		// Why: widths follow column identities, not positions, and hidden columns
		// release their space instead of keeping an unnecessarily wide table.
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
				`Sort by ${column.label}. Click to cycle sorting, drag to reorder, right-click for columns`,
				undefined,
				column.id,
			);
			button.setText(`${column.label}${sort ? ` ${sort.desc ? "↓" : "↑"}${index + 1}` : ""}`);
		}
		const body = table.createEl("tbody");
		for (const [index, result] of items.entries()) {
			const row = body.createEl("tr");
			decorateRow(row, index);
			const data = this.rowsByResult.get(result);
			// Why: render headers and cells from the same visible order so hiding or
			// moving a column cannot leave another column's values beneath its label.
			for (const column of visibleColumns) {
				const cell = row.createEl("td", { attr: { "data-column": column.id } });
				if (column.id === "name") {
					const presentation = this.options.presentation(result);
					renderSelectionItem({ ...presentation, description: undefined }, cell, query);
				} else if (column.id === "path") {
					cell.setText(data?.path ?? result.secondary);
					cell.setAttribute("title", data?.path ?? result.secondary);
				} else if (column.id === "modified") {
					cell.setText(
						data?.modified === undefined ? "—" : this.dateFormat.format(data.modified),
					);
				} else cell.setText(data?.prior === undefined ? "—" : String(data.prior));
			}
		}
	}

	private showColumnMenu(event: MouseEvent): void {
		this.columnMenu?.close();
		const menu = new Menu();
		this.columnMenu = menu;
		const { hiddenColumns } = this.model.columnLayout;
		for (const column of PALETTE_TABLE_COLUMNS) {
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
		menu.showAtMouseEvent(event);
	}

	private headerAtEvent(event: Event): HTMLElement | undefined {
		return event.target instanceof Element
			? (event.target.closest<HTMLElement>("th[data-column]") ?? undefined)
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

	private handleControlClick(event: MouseEvent): void {
		const button = this.buttonAtEvent(event);
		if (!button) return;
		const action = button.dataset.action;
		if (action !== "previous" && action !== "next") return;
		const lastPage = Math.max(
			0,
			Math.ceil(this.results.items.length / PALETTE_TABLE_PAGE_SIZE) - 1,
		);
		this.pageIndex = Math.max(
			0,
			Math.min(lastPage, this.pageIndex + (action === "next" ? 1 : -1)),
		);
		this.render();
		this.panel.resultContainerEl.scrollTop = 0;
		this.restoreControlFocus(action);
		return;
	}

	private changed(): void {
		this.render();
		this.options.onChange(this.getState());
	}

	private restoreControlFocus(action: string, id?: string): void {
		// Rendering replaces pager buttons; restore focus so keyboard users can
		// continue paging without tabbing back through the toolbar.
		this.controlsEl
			.querySelector<HTMLButtonElement>(
				`button[data-action="${action}"]${id ? `[data-column="${id}"]` : ""}`,
			)
			?.focus({ preventScroll: true });
	}

	private buttonAtEvent(event: MouseEvent): HTMLButtonElement | undefined {
		return event.target instanceof Element
			? (event.target.closest<HTMLButtonElement>("button[data-action]") ?? undefined)
			: undefined;
	}

	private button(
		container: HTMLElement,
		action: string,
		title: string,
		icon?: string,
		column?: string,
	): HTMLButtonElement {
		const button = container.createEl("button", {
			cls: icon ? "clickable-icon" : "my-palette-table-button",
			// Why: keep operation hints in the tooltip without adding aria-labels.
			attr: { type: "button", title, "data-action": action },
		});
		if (column) button.dataset.column = column;
		if (icon) setIcon(button, icon);
		return button;
	}
}
