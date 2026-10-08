import { Component, setIcon } from "obsidian";
import { ExtendedSelection } from "src/ui/extendedSelection";

export interface SuggestionPanelProps<T> {
	initialInput?: string;
	placeholder?: string;
	footerText?: string;
	limit?: number;
	surface?: "modal" | "view";
	selectionMode?: "single" | "extended";
	onInput: (input: string) => void;
	renderSuggestion: (item: T, el: HTMLElement, query: string) => void;
	onChoose: (item: T, event: MouseEvent | KeyboardEvent) => void | Promise<void>;
	onResultFocus?: () => void;
	onMiddleClick?: (item: T, event: MouseEvent) => void | Promise<void>;
	/** Left press on an element marked `data-row-toggle` inside a row. */
	onRowToggle?: (item: T, event: MouseEvent) => void;
	onContextMenu?: (item: T, event: MouseEvent, selectedItems: T[]) => void;
	onEscape?: () => void;
	/** Left click on the footer's context text, such as the source note's name. */
	onFooterTextClick?: (event: MouseEvent) => void;
	onFooterTextContextMenu?: (event: MouseEvent) => void;
	onReady?: () => void;
}

export interface SuggestionPanelResults<T> {
	items: T[];
	total?: number;
	error?: string;
	/** Parsed search text when a host strips mode prefixes before matching. */
	query?: string;
}

export interface SuggestionPanelResultsLayout<T> {
	render: (
		container: HTMLElement,
		items: readonly T[],
		query: string,
		decorateRow: (row: HTMLElement, index: number) => void,
	) => void;
}

interface SuggestionChooser<T> {
	values: T[];
	selectedItem: number;
}

/**
 * Reusable input/list surface shared by the modal and workspace view shells.
 * It deliberately knows nothing about Obsidian's Modal or ItemView lifecycle;
 * the host owns where the surface lives and what a successful action means.
 */
export class SuggestionPanel<T> extends Component {
	readonly inputEl: HTMLInputElement;
	readonly resultContainerEl: HTMLElement;
	readonly statusBarEl: HTMLElement;
	readonly statusTextEl: HTMLElement;
	readonly resultCountEl: HTMLElement;
	readonly chooser: SuggestionChooser<T> = { values: [], selectedItem: -1 };
	limit: number;
	selected: T | null = null;
	query = "";
	emptyStateText = "No suggestions";

	private readonly rootEl: HTMLElement;
	private readonly props: SuggestionPanelProps<T>;
	private readonly initialInput: string;
	private readonly selectionMode: "single" | "extended";
	private readonly extendedSelection = new ExtendedSelection();
	private readonly leftClickRows = new WeakSet<Element>();
	private readonly middleClickRows = new WeakSet<Element>();
	private readonly rightClickRows = new WeakSet<Element>();
	private resultsLayout?: SuggestionPanelResultsLayout<T>;
	private interactionMode: "input" | "selection" = "input";
	private readonly modeTextEl: HTMLElement;

	constructor(rootEl: HTMLElement, props: SuggestionPanelProps<T>) {
		super();
		this.rootEl = rootEl;
		this.props = props;
		this.initialInput = props.initialInput ?? "";
		this.selectionMode = props.selectionMode ?? "single";
		this.limit = props.limit ?? 50;
		this.rootEl.empty();
		const surface = props.surface ?? "modal";
		this.rootEl.addClass("my-palette-panel", `my-palette-panel--${surface}`);
		// Obsidian's `prompt` class imposes modal sizing. The persistent view gets
		// its own shell so a narrow sidebar cannot inherit those width constraints.
		if (surface === "modal") this.rootEl.addClass("prompt");
		const inputContainer = this.rootEl.createDiv("prompt-input-container");
		if (surface === "view") {
			const searchIcon = inputContainer.createSpan("my-palette-panel__search-icon");
			setIcon(searchIcon, "search");
		}
		this.inputEl = inputContainer.createEl("input", {
			cls: "prompt-input",
			attr: {
				autocapitalize: "off",
				spellcheck: "false",
				enterkeyhint: "done",
				type: "text",
				placeholder: props.placeholder ?? "Search…",
			},
		});
		this.inputEl.value = this.initialInput;
		const cta = inputContainer.createDiv("prompt-input-cta");
		cta.setAttribute("aria-hidden", "true");
		const clearButton = inputContainer.createDiv("search-input-clear-button");
		clearButton.setAttribute("aria-hidden", "true");
		this.resultContainerEl = this.rootEl.createDiv("prompt-results");
		this.resultContainerEl.setAttribute("role", "listbox");
		if (this.selectionMode === "extended")
			this.resultContainerEl.setAttribute("aria-multiselectable", "true");
		this.statusBarEl = this.rootEl.createDiv("my-palette-status-bar");
		this.modeTextEl = this.statusBarEl.createSpan("my-palette-status-bar__mode");
		this.statusTextEl = this.statusBarEl.createSpan({
			cls: "my-palette-status-bar__text",
			text: props.footerText ?? "",
		});
		this.resultCountEl = this.statusBarEl.createSpan("my-palette-status-bar__count");
		this.updateResultCount(0);
	}

	onload(): void {
		this.setInteractionMode("input");
		this.registerDomEvent(this.inputEl, "mousedown", () => this.setInteractionMode("input"));
		this.registerDomEvent(this.inputEl, "input", () => this.props.onInput(this.inputEl.value));
		this.registerDomEvent(this.inputEl, "keydown", (event) => this.handleInputKeyDown(event));
		this.registerPointerActions();
		this.registerFooterTextActions();
		this.props.onReady?.();
	}

	setResults({ items, total = items.length, error, query }: SuggestionPanelResults<T>): void {
		this.emptyStateText = error ?? "No suggestions";
		// Hosts may parse prefixes; highlighting must use the same text as matching.
		this.query = query ?? this.inputEl.value;
		this.chooser.values = items.slice(0, this.limit);
		this.chooser.selectedItem = this.chooser.values.length ? 0 : -1;
		this.extendedSelection.reset(this.chooser.values.length);
		this.selected = this.chooser.values[0] ?? null;
		this.updateResultCount(total);
		this.resultContainerEl.empty();
		if (this.resultsLayout) {
			// The layout owns markup while this panel owns row indexes and selection.
			// Both keyboard and pointer actions therefore use the displayed sort order.
			this.resultsLayout.render(
				this.resultContainerEl,
				this.chooser.values,
				this.query,
				(row, index) => this.decorateRow(row, index),
			);
		}
		if (!this.chooser.values.length) {
			this.resultContainerEl.createDiv({
				cls: "suggestion-empty",
				text: this.emptyStateText,
			});
			return;
		}
		if (this.resultsLayout) return;
		for (const [index, item] of this.chooser.values.entries()) {
			const el = this.resultContainerEl.createDiv("suggestion-item");
			this.decorateRow(el, index);
			this.props.renderSuggestion(item, el, this.query);
		}
	}

	/**
	 * Redraw the visible rows in place. Unlike setResults this keeps the cursor,
	 * the extended selection and the scroll position, for hosts whose rows change
	 * appearance (such as a check mark) without changing the list itself.
	 */
	rerenderRows(): void {
		if (this.resultsLayout) return;
		for (const row of this.resultContainerEl.querySelectorAll<HTMLElement>(
			".suggestion-item",
		)) {
			const item = this.itemAtRow(row);
			if (item === undefined) continue;
			row.empty();
			this.props.renderSuggestion(item, row, this.query);
		}
	}

	setResultsLayout(layout?: SuggestionPanelResultsLayout<T>): void {
		this.resultsLayout = layout;
		this.resultContainerEl.setAttribute("role", layout ? "region" : "listbox");
		if (layout) this.resultContainerEl.removeAttribute("aria-multiselectable");
		else if (this.selectionMode === "extended")
			this.resultContainerEl.setAttribute("aria-multiselectable", "true");
	}

	private decorateRow(row: HTMLElement, index: number): void {
		row.addClass("suggestion-item");
		row.setAttribute("data-index", String(index));
		row.setAttribute("role", this.resultsLayout ? "row" : "option");
		row.setAttribute("aria-selected", String(index === 0));
		if (index === 0) row.addClass("is-selected", "is-active");
	}

	setInput(input: string, selection: "all" | "end" | "none" = "none"): void {
		// History and source controls replace the query for further editing.
		this.setInteractionMode("input");
		this.inputEl.value = input;
		if (selection === "all") this.inputEl.select();
		if (selection === "end") this.inputEl.setSelectionRange(input.length, input.length);
	}

	focusSearchInput(): void {
		this.setInteractionMode("input");
		if (this.inputEl.isConnected) this.inputEl.focus({ preventScroll: true });
	}

	private setInteractionMode(mode: "input" | "selection"): void {
		this.interactionMode = mode;
		this.rootEl.classList.toggle("is-input-mode", mode === "input");
		// Retain DOM focus for list shortcuts while blocking typing, paste and IME
		// from changing the query until the user explicitly returns to input mode.
		this.inputEl.readOnly = mode === "selection";
		this.modeTextEl.setText(
			mode === "input" ? "Input · ↑/↓: select" : "Selection · ↑/f: input",
		);
	}

	private focusResults(): void {
		this.setInteractionMode("selection");
		this.props.onResultFocus?.();
	}

	/**
	 * Why: after focus left the input, a press on empty list space moved focus to
	 * nothing, so the arrow keys (handled on the input) went unheard until a row
	 * was clicked. Hand focus back to the input, in selection mode so typing
	 * stays blocked, without committing history the way a result press does.
	 */
	private restoreFocusFromListSpace(event: MouseEvent): void {
		if (event.button !== 0) return;
		const target = event.target as Node | null;
		// Controls such as table header buttons keep their own focus behavior.
		if (
			target?.instanceOf(Element) &&
			target.closest("button, input, select, textarea, a, [tabindex]")
		)
			return;
		event.preventDefault();
		this.setInteractionMode("selection");
		if (this.inputEl.isConnected) this.inputEl.focus({ preventScroll: true });
	}

	updatePlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	updateFooterText(text: string, icon?: string): void {
		this.statusTextEl.empty();
		this.statusTextEl.setAttribute("title", text);
		if (icon) setIcon(this.statusTextEl.createSpan("my-palette-status-bar__icon"), icon);
		this.statusTextEl.appendText(text);
	}

	private registerFooterTextActions(): void {
		const { onFooterTextClick, onFooterTextContextMenu } = this.props;
		if (!onFooterTextClick && !onFooterTextContextMenu) return;
		this.statusTextEl.addClass("is-interactive");
		// Why: a press on the footer must not pull focus out of the input, which
		// would silence the arrow keys exactly like pressing empty list space did.
		this.registerDomEvent(this.statusTextEl, "mousedown", (event) => event.preventDefault());
		if (onFooterTextClick)
			this.registerDomEvent(this.statusTextEl, "click", (event) => onFooterTextClick(event));
		if (onFooterTextContextMenu)
			this.registerDomEvent(this.statusTextEl, "contextmenu", (event) => {
				event.preventDefault();
				onFooterTextContextMenu(event);
			});
	}

	updateResultCount(total: number): void {
		this.resultCountEl.setText(`${Math.min(total, this.limit)} / ${total}`);
	}

	setAttribute(name: string, value: string): void {
		this.rootEl.setAttribute(name, value);
	}

	getSelectedItems(): T[] {
		if (this.selectionMode !== "extended") {
			const item = this.getSelectedItem();
			return item === undefined ? [] : [item];
		}
		return this.extendedSelection
			.indexes()
			.map((index) => this.chooser.values[index])
			.filter((item): item is T => item !== undefined);
	}

	private handleInputKeyDown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (
			this.interactionMode === "selection" &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey &&
			event.key.toLowerCase() === "f"
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.focusSearchInput();
			return;
		}
		if (
			this.interactionMode === "selection" &&
			this.selectionMode === "extended" &&
			event.key === " " &&
			!event.ctrlKey &&
			!event.metaKey &&
			!event.altKey
		) {
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) {
				this.extendedSelection.select(
					this.chooser.selectedItem,
					this.chooser.values.length,
					{ toggle: true, range: event.shiftKey },
				);
				this.setSelectedIndex(this.chooser.selectedItem, false);
			}
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.props.onEscape?.();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			if (this.interactionMode === "input") {
				// The first arrow transfers focus to row zero without skipping a result
				// or extending a selection retained from the previous interaction.
				this.focusResults();
				this.extendedSelection.reset(this.chooser.values.length);
				this.setSelectedIndex(0, true);
				return;
			}
			if (
				event.key === "ArrowUp" &&
				this.chooser.selectedItem <= 0 &&
				!event.shiftKey &&
				!event.ctrlKey &&
				!event.metaKey
			) {
				// Why: ArrowDown from the input enters the list, so ArrowUp past the first
				// row should leave it symmetrically instead of stopping at a dead end.
				this.focusSearchInput();
				return;
			}
			if (!this.chooser.values.length) return;
			// Keyboard selection uses the result list while focus remains in the input.
			// Record that interaction just as we do for a pointer press on a result.
			this.focusResults();
			const next = Math.max(
				0,
				Math.min(
					this.chooser.values.length - 1,
					this.chooser.selectedItem + (event.key === "ArrowDown" ? 1 : -1),
				),
			);
			if (this.selectionMode === "extended" && !(event.ctrlKey || event.metaKey))
				this.extendedSelection.select(next, this.chooser.values.length, {
					toggle: false,
					range: event.shiftKey,
				});
			this.setSelectedIndex(next, true);
			return;
		}
		if (event.key === "Enter") {
			const item = this.getSelectedItem();
			if (item === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			this.focusResults();
			this.selected = item;
			void this.props.onChoose(item, event);
		}
	}

	private registerPointerActions(): void {
		// Component unload removes every listener, so each load must register them
		// again when the same modal instance is reopened.
		this.registerDomEvent(
			this.resultContainerEl,
			"pointermove",
			(event) => {
				if (this.selectionMode === "extended") return;
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				const index = Number(row.getAttribute("data-index"));
				if (Number.isInteger(index)) this.setSelectedIndex(index, false);
			},
			true,
		);
		this.registerDomEvent(
			this.resultContainerEl,
			"mousedown",
			(event) => {
				// Result clicks are the concrete browser event that moves the user's
				// attention from typing to the result list.
				// Modal list-space clicks historically commit the query too; views
				// also contain table headers, so they commit only actual result rows.
				const modal = this.props.surface !== "view";
				if (modal) this.focusResults();
				const row = this.suggestionRowAtEvent(event);
				if (!row) {
					this.restoreFocusFromListSpace(event);
					return;
				}
				// Sorting headers share the result container, but only interacting
				// with an actual result should commit the search to usage history.
				if (!modal) this.focusResults();
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				// Why: keep the middle-click guard through click/auxclick, then reset
				// it on the next press so one gesture cannot open the same note twice.
				this.middleClickRows.delete(row);
				const index = Number(row.getAttribute("data-index"));
				if (event.button === 0 && this.isRowToggleEvent(event)) {
					// Why: a toggle control acts at once on its own row; letting the press
					// fall through would also change the highlighted selection.
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.props.onRowToggle?.(item, event);
				} else if (event.button === 0 && this.selectionMode === "extended") {
					// Why: the sidebar can lose its click to Obsidian after mousedown;
					// select now and leave opening exclusively to double-click/Enter.
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.extendedSelection.select(index, this.chooser.values.length, {
						toggle: event.ctrlKey || event.metaKey,
						range: event.shiftKey,
					});
					this.setSelectedIndex(index, false);
				} else if (event.button === 0 && this.props.surface === "view") {
					// Sidebar clicks can be consumed by Obsidian after mousedown, so run
					// the primary action here and let the later click only clear the guard.
					// Single-choice modals retain normal click activation.
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.setSelectedIndex(index, false);
					void this.props.onChoose(item, event);
				} else if (event.button === 1 && this.props.onMiddleClick) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.handleMiddleClick(row, event);
				} else if (event.button === 2 && this.props.onContextMenu) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.rightClickRows.add(row);
					if (this.selectionMode === "extended")
						this.extendedSelection.selectForContextMenu(
							index,
							this.chooser.values.length,
						);
					this.setSelectedIndex(index, false);
				}
			},
			true,
		);
		this.registerDomEvent(
			this.resultContainerEl,
			"dblclick",
			(event) => {
				if (this.selectionMode !== "extended" || event.button !== 0) return;
				// Two quick presses on a toggle already toggled twice; the dblclick that
				// follows must not activate the row as well.
				if (this.isRowToggleEvent(event)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				const row = this.suggestionRowAtEvent(event);
				const item = row ? this.itemAtRow(row) : undefined;
				if (!row || item === undefined) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
				void this.props.onChoose(item, event);
			},
			true,
		);
		this.registerDomEvent(
			this.resultContainerEl,
			"auxclick",
			(event) => {
				if (event.button !== 1 && event.button !== 2) return;
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				// Why: an auxiliary right-click must never use the middle-click action,
				// even when the host did not deliver its preceding mousedown.
				if (event.button === 1) this.handleMiddleClick(row, event);
			},
			true,
		);
		this.registerDomEvent(
			this.resultContainerEl,
			"click",
			(event) => {
				// 中・右クリック後に発火する click/auxclick の取りこぼしが
				// primary 扱いで onChoose へ落ちてアクティブタブを上書きするため、
				// 左クリック以外はここで確実に消費する。
				// なぜこう書かれたか: Electron/Win では中クリックで click が、
				// 右クリックで click が飛ぶ環境があり、ガード漏れが上書きの原因だった。
				if (event.button !== 0) {
					event.preventDefault();
					event.stopImmediatePropagation();
					// Why: some Electron hosts send click instead of auxclick for the
					// middle button; share the guard with the normal mousedown route.
					const row = this.suggestionRowAtEvent(event);
					if (event.button === 1 && row) this.handleMiddleClick(row, event);
					return;
				}
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				if (this.middleClickRows.has(row)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (this.leftClickRows.delete(row)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (this.rightClickRows.delete(row)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (this.selectionMode === "extended") return;
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
				void this.props.onChoose(item, event);
			},
			true,
		);
		this.registerDomEvent(
			this.resultContainerEl,
			"contextmenu",
			(event) => {
				if (!this.props.onContextMenu) return;
				const row = this.suggestionRowAtEvent(event);
				const item = row ? this.itemAtRow(row) : undefined;
				if (!row || item === undefined) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.rightClickRows.add(row);
				const index = Number(row.getAttribute("data-index"));
				if (this.selectionMode === "extended")
					this.extendedSelection.selectForContextMenu(index, this.chooser.values.length);
				this.setSelectedIndex(index, false);
				this.props.onContextMenu(item, event, this.getSelectedItems());
			},
			true,
		);
	}

	private handleMiddleClick(row: Element, event: MouseEvent): void {
		if (this.middleClickRows.has(row) || !this.props.onMiddleClick) return;
		const item = this.itemAtRow(row);
		if (item === undefined) return;
		this.middleClickRows.add(row);
		this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
		void this.props.onMiddleClick(item, event);
	}

	private isRowToggleEvent(event: Event): boolean {
		if (!this.props.onRowToggle) return false;
		const target = event.target as Node | null;
		return Boolean(target?.instanceOf(Element) && target.closest("[data-row-toggle]"));
	}

	private suggestionRowAtEvent(event: Event): Element | undefined {
		const target = event.target as Node | null;
		// Why: restored popout panes create nodes in another window, whose Element
		// constructor differs from the plugin's window. Obsidian checks across realms.
		if (!target?.instanceOf(Element)) return undefined;
		const row = target.closest(".suggestion-item");
		return row && this.resultContainerEl.contains(row) ? row : undefined;
	}

	private itemAtRow(row: Element): T | undefined {
		const index = Number(row.getAttribute("data-index"));
		return Number.isInteger(index) && index >= 0 ? this.chooser.values[index] : undefined;
	}

	/** Index of the cursor row, or -1 when the list is empty. */
	get activeIndex(): number {
		return this.chooser.selectedItem;
	}

	/**
	 * Reinstates the selection and cursor after a rerender. Rows are given by index in
	 * the new list because a rerender resets the selection to the first row.
	 */
	restoreSelection(indexes: readonly number[], activeIndex: number): void {
		this.extendedSelection.restore(indexes, activeIndex, this.chooser.values.length);
		this.setSelectedIndex(activeIndex >= 0 ? activeIndex : 0, false);
	}

	getSelectedItem(): T | undefined {
		return this.chooser.values[this.chooser.selectedItem];
	}

	setSelectedIndex(index: number, scroll: boolean): void {
		if (!this.chooser.values.length) {
			this.chooser.selectedItem = -1;
			this.selected = null;
			return;
		}
		const next = Math.max(0, Math.min(this.chooser.values.length - 1, index));
		this.chooser.selectedItem = next;
		this.selected = this.chooser.values[next] ?? null;
		for (const [rowIndex, row] of [
			...this.resultContainerEl.querySelectorAll<HTMLElement>(".suggestion-item"),
		].entries()) {
			row.toggleClass(
				"is-selected",
				this.selectionMode === "extended"
					? this.extendedSelection.has(rowIndex)
					: rowIndex === next,
			);
			row.toggleClass("is-active", rowIndex === next);
			row.setAttribute(
				"aria-selected",
				String(
					this.selectionMode === "extended"
						? this.extendedSelection.has(rowIndex)
						: rowIndex === next,
				),
			);
		}
		if (scroll)
			this.resultContainerEl
				.querySelector<HTMLElement>(`.suggestion-item[data-index="${next}"]`)
				?.scrollIntoView({ block: "nearest" });
	}
}
