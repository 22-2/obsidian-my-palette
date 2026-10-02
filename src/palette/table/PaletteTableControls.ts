import { Component, TFile, setIcon, type App } from "obsidian";
import type { PaletteResult } from "src/palette/results";
import {
	PALETTE_TABLE_COLUMNS,
	PaletteTableModel,
	normalizePaletteTableState,
	type PaletteTableRow,
	type PaletteTableState,
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
	private readonly sortBarEl: HTMLElement;
	private readonly dateFormat = new Intl.DateTimeFormat(undefined, {
		dateStyle: "short",
		timeStyle: "short",
	});
	private pageIndex = 0;
	private results: SuggestionPanelResults<PaletteResult> = { items: [] };
	private rowsByResult = new Map<PaletteResult, PaletteTableRow>();

	constructor(
		private readonly panel: SuggestionPanel<PaletteResult>,
		private readonly app: App,
		private readonly options: PaletteTableControlsOptions,
	) {
		super();
		this.model = new PaletteTableModel(options.initialState.sorting);
		this.controlsEl = createDiv({ cls: "my-palette-table-controls" });
		panel.resultContainerEl.before(this.controlsEl);
		this.toolbarEl = this.controlsEl.createDiv("my-palette-table-toolbar");
		this.sortBarEl = this.controlsEl.createDiv("my-palette-table-sort-bar");
	}

	onload(): void {
		this.registerDomEvent(this.controlsEl, "click", (event) => this.handleControlClick(event));
		this.registerDomEvent(this.panel.resultContainerEl, "click", (event) => {
			const button = this.buttonAtEvent(event);
			if (!button || button.dataset.action !== "sort") return;
			event.preventDefault();
			event.stopPropagation();
			const column = PALETTE_TABLE_COLUMNS.find(({ id }) => id === button.dataset.column);
			if (!column) return;
			this.model.toggleSorting(column.id, event.shiftKey);
			this.pageIndex = 0;
			this.changed();
			this.panel.resultContainerEl
				.querySelector<HTMLButtonElement>(`button[data-column="${column.id}"]`)
				?.focus({ preventScroll: true });
		});
	}

	onunload(): void {
		this.controlsEl.remove();
	}

	getState(): PaletteTableState {
		return {
			displayMode: "table",
			sorting: this.model.sorting.map((sort) => ({ ...sort })),
		};
	}

	setState(state: PaletteTableState): void {
		const next = normalizePaletteTableState(state);
		this.model.setSorting(next.sorting);
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
		// Why: these controls belong exclusively to PaletteTableView. Fix the
		// presentation so persisted legacy state cannot reintroduce a mode toggle.
		this.panel.setAttribute("data-result-layout", "table");
		this.renderToolbar();
		this.renderSortBar();
		this.panel.setResultsLayout({
			render: (container, items, query, decorateRow) =>
				this.renderTable(container, items, query, decorateRow),
		});
		const items = this.model.page(this.pageIndex, this.panel.limit).map((row) => row.result);
		this.panel.setResults({
			...this.results,
			items,
			total: this.results.total ?? this.results.items.length,
		});
		const start = items.length ? this.pageIndex * this.panel.limit + 1 : 0;
		const end = this.pageIndex * this.panel.limit + items.length;
		this.panel.resultCountEl.setText(
			`${start}–${end} / ${this.results.total ?? this.results.items.length}`,
		);
	}

	private renderToolbar(): void {
		this.toolbarEl.empty();
		const pager = this.toolbarEl.createDiv("my-palette-table-pager");
		const pages = Math.max(1, Math.ceil(this.results.items.length / this.panel.limit));
		this.button(pager, "previous", "Previous page", "chevron-left").disabled =
			this.pageIndex === 0;
		pager.createSpan({ text: `${this.pageIndex + 1} / ${pages}` });
		this.button(pager, "next", "Next page", "chevron-right").disabled =
			this.pageIndex + 1 >= pages;
	}

	private renderSortBar(): void {
		this.sortBarEl.empty();
		if (!this.model.sorting.length) {
			this.sortBarEl.createSpan({
				text: "Search order · Shift-click headers to sort by multiple columns",
			});
			return;
		}
		for (const [index, sort] of this.model.sorting.entries()) {
			const label = PALETTE_TABLE_COLUMNS.find(({ id }) => id === sort.id)?.label ?? sort.id;
			const priority = this.sortBarEl.createDiv("my-palette-table-priority");
			priority.createSpan({ text: `${index + 1}. ${label}` });
			this.button(
				priority,
				"direction",
				`${label}: ${sort.desc ? "descending" : "ascending"}. Reverse sort`,
				sort.desc ? "arrow-down" : "arrow-up",
				sort.id,
			);
			this.button(
				priority,
				"earlier",
				`Move ${label} earlier`,
				"chevron-left",
				sort.id,
			).disabled = index === 0;
			this.button(
				priority,
				"later",
				`Move ${label} later`,
				"chevron-right",
				sort.id,
			).disabled = index === this.model.sorting.length - 1;
			this.button(priority, "remove", `Remove ${label} sort`, "x", sort.id);
		}
		const reset = this.button(this.sortBarEl, "reset", "Restore search order");
		reset.setText("Reset");
	}

	private renderTable(
		container: HTMLElement,
		items: readonly PaletteResult[],
		query: string,
		decorateRow: (row: HTMLElement, index: number) => void,
	): void {
		const table = container.createEl("table", {
			cls: "my-palette-results-table",
			attr: { role: "grid", "aria-label": "Search results", "aria-multiselectable": "true" },
		});
		const head = table.createEl("thead").createEl("tr");
		for (const column of PALETTE_TABLE_COLUMNS) {
			const th = head.createEl("th", { attr: { scope: "col" } });
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
				`Sort by ${column.label}. Shift-click to add to sorting`,
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
			const name = row.createEl("td");
			const presentation = this.options.presentation(result);
			renderSelectionItem({ ...presentation, description: undefined }, name, query);
			const path = row.createEl("td", { text: data?.path ?? result.secondary });
			path.setAttribute("title", data?.path ?? result.secondary);
			row.createEl("td", {
				text: data?.modified === undefined ? "—" : this.dateFormat.format(data.modified),
			});
			row.createEl("td", { text: data?.prior === undefined ? "—" : String(data.prior) });
		}
	}

	private handleControlClick(event: MouseEvent): void {
		const button = this.buttonAtEvent(event);
		if (!button) return;
		const action = button.dataset.action;
		const id = button.dataset.column;
		if (action === "previous" || action === "next") {
			const lastPage = Math.max(
				0,
				Math.ceil(this.results.items.length / this.panel.limit) - 1,
			);
			this.pageIndex = Math.max(
				0,
				Math.min(lastPage, this.pageIndex + (action === "next" ? 1 : -1)),
			);
			this.render();
			this.panel.resultContainerEl.scrollTop = 0;
			this.restoreControlFocus(action);
			return;
		} else if (action === "reset") this.model.setSorting([]);
		else if (id && (action === "earlier" || action === "later"))
			this.model.movePriority(id, action === "earlier" ? -1 : 1);
		else if (id && (action === "remove" || action === "direction")) {
			this.model.setSorting(
				this.model.sorting.flatMap((sort) =>
					sort.id !== id
						? [sort]
						: action === "remove"
							? []
							: [{ ...sort, desc: !sort.desc }],
				),
			);
		} else return;
		this.pageIndex = 0;
		this.changed();
		this.restoreControlFocus(action ?? "", id);
	}

	private changed(): void {
		this.render();
		this.options.onChange(this.getState());
	}

	private restoreControlFocus(action: string, id?: string): void {
		// Rendering replaces buttons; restore focus so keyboard users can keep
		// changing direction or priority without tabbing back through the toolbar.
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
			attr: { type: "button", title, "aria-label": title, "data-action": action },
		});
		if (column) button.dataset.column = column;
		if (icon) setIcon(button, icon);
		return button;
	}
}
