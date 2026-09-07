import { Component, setIcon } from "obsidian";

export interface SuggestionPanelProps<T> {
	initialInput?: string;
	placeholder?: string;
	footerText?: string;
	limit?: number;
	surface?: "modal" | "view";
	onInput: (input: string) => void;
	renderSuggestion: (item: T, el: HTMLElement, query: string) => void;
	onChoose: (item: T, event: MouseEvent | KeyboardEvent) => void | Promise<void>;
	onResultFocus?: () => void;
	onMiddleClick?: (item: T, event: MouseEvent) => void | Promise<void>;
	onContextMenu?: (item: T, event: MouseEvent) => void;
	onEscape?: () => void;
	onReady?: () => void;
}

export interface SuggestionPanelResults<T> {
	items: T[];
	total?: number;
	error?: string;
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
	readonly limit: number;
	selected: T | null = null;
	query = "";
	emptyStateText = "No suggestions";

	private readonly rootEl: HTMLElement;
	private readonly props: SuggestionPanelProps<T>;
	private readonly initialInput: string;
	private pointerActionsRegistered = false;
	private readonly leftClickRows = new WeakSet<Element>();
	private readonly middleClickRows = new WeakSet<Element>();
	private readonly rightClickRows = new WeakSet<Element>();

	constructor(rootEl: HTMLElement, props: SuggestionPanelProps<T>) {
		super();
		this.rootEl = rootEl;
		this.props = props;
		this.initialInput = props.initialInput ?? "";
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
		this.statusBarEl = this.rootEl.createDiv("my-palette-status-bar");
		this.statusTextEl = this.statusBarEl.createSpan({
			cls: "my-palette-status-bar__text",
			text: props.footerText ?? "",
		});
		this.resultCountEl = this.statusBarEl.createSpan("my-palette-status-bar__count");
		this.updateResultCount(0);
	}

	onload(): void {
		this.registerDomEvent(this.inputEl, "input", () => this.props.onInput(this.inputEl.value));
		this.registerDomEvent(this.inputEl, "keydown", (event) => this.handleInputKeyDown(event));
		this.registerPointerActions();
		this.props.onReady?.();
	}

	setResults({ items, total = items.length, error }: SuggestionPanelResults<T>): void {
		this.emptyStateText = error ?? "No suggestions";
		this.query = this.inputEl.value;
		this.chooser.values = items.slice(0, this.limit);
		this.chooser.selectedItem = this.chooser.values.length ? 0 : -1;
		this.selected = this.chooser.values[0] ?? null;
		this.updateResultCount(total);
		this.resultContainerEl.empty();
		if (!this.chooser.values.length) {
			this.resultContainerEl.createDiv({
				cls: "suggestion-empty",
				text: this.emptyStateText,
			});
			return;
		}
		for (const [index, item] of this.chooser.values.entries()) {
			const el = this.resultContainerEl.createDiv("suggestion-item");
			el.setAttribute("data-index", String(index));
			if (index === 0) el.addClass("is-selected");
			this.props.renderSuggestion(item, el, this.query);
		}
	}

	setInput(input: string, selection: "all" | "end" | "none" = "none"): void {
		this.inputEl.value = input;
		if (selection === "all") this.inputEl.select();
		if (selection === "end") this.inputEl.setSelectionRange(input.length, input.length);
	}

	focusSearchInput(): void {
		if (this.inputEl.isConnected) this.inputEl.focus({ preventScroll: true });
	}

	updatePlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	updateFooterText(text: string): void {
		this.statusTextEl.setText(text);
	}

	updateResultCount(total: number): void {
		this.resultCountEl.setText(`${Math.min(total, this.limit)} / ${total}`);
	}

	setAttribute(name: string, value: string): void {
		this.rootEl.setAttribute(name, value);
	}

	private handleInputKeyDown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.props.onEscape?.();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			this.setSelectedIndex(
				this.chooser.selectedItem + (event.key === "ArrowDown" ? 1 : -1),
				true,
			);
			return;
		}
		if (event.key === "Enter") {
			const item = this.getSelectedItem();
			if (item === undefined) return;
			event.preventDefault();
			event.stopPropagation();
			this.selected = item;
			void this.props.onChoose(item, event);
		}
	}

	private registerPointerActions(): void {
		if (this.pointerActionsRegistered) return;
		this.pointerActionsRegistered = true;
		this.registerDomEvent(
			this.resultContainerEl,
			"pointermove",
			(event) => {
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
				this.props.onResultFocus?.();
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				const index = Number(row.getAttribute("data-index"));
				if (event.button === 0) {
					// Sidebar clicks can be consumed by Obsidian after mousedown, so run
					// the primary action here and let the later click only clear the guard.
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.setSelectedIndex(index, false);
					void this.props.onChoose(item, event);
				} else if (event.button === 1 && this.props.onMiddleClick) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.middleClickRows.add(row);
					this.setSelectedIndex(index, false);
					void this.props.onMiddleClick(item, event);
				} else if (event.button === 2 && this.props.onContextMenu) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.rightClickRows.add(row);
					this.setSelectedIndex(index, false);
				}
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
				if (this.rightClickRows.delete(row)) return;
				if (this.middleClickRows.delete(row)) return;
				const item = this.itemAtRow(row);
				if (item !== undefined && this.props.onMiddleClick)
					void this.props.onMiddleClick(item, event);
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
					return;
				}
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				if (this.middleClickRows.delete(row)) {
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
				this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
				this.props.onContextMenu(item, event);
			},
			true,
		);
	}

	private suggestionRowAtEvent(event: Event): Element | undefined {
		const target = event.target;
		if (!(target instanceof Element)) return undefined;
		const row = target.closest(".suggestion-item");
		return row && this.resultContainerEl.contains(row) ? row : undefined;
	}

	private itemAtRow(row: Element): T | undefined {
		const index = Number(row.getAttribute("data-index"));
		return Number.isInteger(index) && index >= 0 ? this.chooser.values[index] : undefined;
	}

	private getSelectedItem(): T | undefined {
		return this.chooser.values[this.chooser.selectedItem];
	}

	private setSelectedIndex(index: number, scroll: boolean): void {
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
		].entries())
			row.toggleClass("is-selected", rowIndex === next);
		if (scroll)
			this.resultContainerEl
				.querySelector<HTMLElement>(`.suggestion-item[data-index="${next}"]`)
				?.scrollIntoView({ block: "nearest" });
	}
}
