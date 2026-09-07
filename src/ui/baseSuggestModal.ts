import { App, Modal, type KeymapEventHandler } from "obsidian";
import { ExtendedSelection } from "src/ui/extendedSelection";

export interface SuggestModalProps<T> {
	title?: string;
	items?: T[];
	placeholder?: string;
	defaultValue?: T;
	initialInput?: string;
	footerText?: string;
	selectionMode?: "single" | "extended";
	/** Optional dynamic source used by selectors whose candidates depend on input. */
	search?: (query: string) => T[] | Promise<T[]>;
}

interface SuggestionChooser<T> {
	values: T[];
	selectedItem: number;
	setSelectedItem: (index: number) => void;
}

/**
 * Obsidian SuggestModal互換のDOMと操作を提供する基底モーダル。
 * 検索と候補行の描画は派生クラスに任せ、ポインターイベントはここで一元管理する。
 */
export abstract class BaseSuggestModal<T> extends Modal {
	protected items: T[];
	selected: T | null;
	inputEl!: HTMLInputElement;
	resultContainerEl!: HTMLElement;
	limit = 50;
	emptyStateText = "No suggestions";
	protected initialInputReady: boolean;
	protected readonly chooser: SuggestionChooser<T>;
	protected query = "";
	private resultCountEl?: HTMLElement;
	private statusTextEl?: HTMLElement;
	private readonly footerText?: string;
	private readonly initialInput: string;
	private readonly selectionMode: "single" | "extended";
	private refreshGeneration = 0;
	private pointerActionsRegistered = false;
	private readonly extendedSelection = new ExtendedSelection();
	private readonly leftClickRows = new WeakSet<Element>();
	private readonly middleClickRows = new WeakSet<Element>();
	private readonly rightClickRows = new WeakSet<Element>();

	constructor(
		{
			items = [],
			defaultValue,
			placeholder = "Search…",
			initialInput = "",
			footerText,
			selectionMode = "single",
		}: SuggestModalProps<T>,
		app: App,
	) {
		super(app);
		this.items = [...items];
		this.selected = defaultValue ?? null;
		this.initialInput = initialInput;
		this.initialInputReady = !initialInput;
		this.footerText = footerText;
		this.selectionMode = selectionMode;
		this.chooser = {
			values: [],
			selectedItem: -1,
			setSelectedItem: (index) => this.setSelectedIndex(index, true),
		};
		this.createInterface(placeholder);
		const scopeHandlers = (this.scope as unknown as { keys?: KeymapEventHandler[] }).keys ?? [];
		for (let index = scopeHandlers.length - 1; index >= 0; index -= 1) {
			const handler = scopeHandlers[index];
			if (
				(handler.key === "Home" || handler.key === "End" || handler.key === "Escape") &&
				handler.modifiers === ""
			)
				this.scope.unregister(handler);
		}
		for (const key of ["Home", "End"]) {
			this.scope.register([], key, (event) => this.handleHomeEnd(event));
			this.scope.register(["Ctrl"], key, (event) => this.handleHomeEnd(event));
		}
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.removeClass("modal");
		this.modalEl.addClass("prompt", "my-palette-suggest-modal");
		this.createStatusBar();
		this.registerPointerActions();
		this.onSelectionModalOpen();
		this.inputEl.focus({ preventScroll: true });
		if (this.initialInput) {
			window.setTimeout(() => {
				if (!this.inputEl.isConnected) return;
				this.initialInputReady = true;
				this.refreshSuggestions();
				const [selectionStart, selectionEnd] = this.getInitialInputSelectionRange();
				this.inputEl.setSelectionRange(selectionStart, selectionEnd);
			}, 0);
		} else {
			this.refreshSuggestions();
		}
	}

	onClose(): void {
		this.refreshGeneration += 1;
		this.onSelectionModalClose();
		super.onClose();
	}

	abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(item: T, el: HTMLElement): void;

	onChooseSuggestion(item: T, event: MouseEvent | KeyboardEvent): void {
		this.selected = item;
		void this.onItemActivated(item, event);
	}

	protected onSelectionModalOpen(): void {}
	protected onSelectionModalClose(): void {}
	protected handlesSuggestionMiddleClick(): boolean {
		return false;
	}
	protected handlesSuggestionContextMenu(): boolean {
		return false;
	}
	protected async onSuggestionMiddleClick(_item: T, _event: MouseEvent): Promise<void> {}
	protected onSuggestionContextMenu(_item: T, _event: MouseEvent): void {}
	protected onResultFocus(): void {}
	protected getSelectedItems(): T[] {
		if (this.selectionMode !== "extended") {
			const item = this.getSelectedItem();
			return item === undefined ? [] : [item];
		}
		return this.extendedSelection
			.indexes()
			.map((index) => this.chooser.values[index])
			.filter((item): item is T => item !== undefined);
	}

	protected getInitialInputSelectionRange(): [number, number] {
		return [0, this.inputEl.value.length];
	}

	protected async onItemActivated(item: T, _event: Event): Promise<void> {
		this.selected = item;
		this.close();
	}

	protected setItems(items: T[]): void {
		this.items = items;
	}

	protected updateResultCount(total: number): void {
		this.resultCountEl?.setText(`${Math.min(total, this.limit)} / ${total}`);
	}

	protected updateFooterText(text: string): void {
		this.statusTextEl?.setText(text);
	}

	protected updateMatchQuery(query: string): void {
		this.query = query;
	}

	focusSearchInput(): void {
		if (!this.inputEl.isConnected) return;
		this.inputEl.focus({ preventScroll: true });
	}

	protected updatePlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	protected registerSelectionDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	): void {
		el.addEventListener(type, callback as EventListener, options);
	}

	protected refreshSuggestions(): void {
		if (!this.inputEl.isConnected) return;
		const query = this.inputEl.value;
		const generation = ++this.refreshGeneration;
		this.query = query;
		this.emptyStateText = "No suggestions";
		const suggestions = this.getSuggestions(query);
		void Promise.resolve(suggestions).then((items) => {
			if (generation !== this.refreshGeneration || !this.inputEl.isConnected) return;
			this.renderSuggestions(items);
		});
	}

	private createInterface(placeholder: string): void {
		this.modalEl.empty();
		this.modalEl.addClass("prompt");
		const inputContainer = this.modalEl.createDiv("prompt-input-container");
		this.inputEl = inputContainer.createEl("input", {
			cls: "prompt-input",
			attr: {
				autocapitalize: "off",
				spellcheck: "false",
				enterkeyhint: "done",
				type: "text",
				placeholder,
			},
		});
		this.inputEl.value = this.initialInput;
		const cta = inputContainer.createDiv("prompt-input-cta");
		cta.setAttribute("aria-hidden", "true");
		const clearButton = inputContainer.createDiv("search-input-clear-button");
		clearButton.setAttribute("aria-hidden", "true");
		this.resultContainerEl = this.modalEl.createDiv("prompt-results");
		this.resultContainerEl.setAttribute("role", "listbox");
		if (this.selectionMode === "extended")
			this.resultContainerEl.setAttribute("aria-multiselectable", "true");
		this.inputEl.addEventListener("input", () => this.refreshSuggestions());
		this.inputEl.addEventListener("keydown", (event) => this.handleInputKeyDown(event));
	}

	private createStatusBar(): void {
		const statusBar = this.modalEl.createDiv("my-palette-status-bar");
		this.statusTextEl = statusBar.createSpan({
			cls: "my-palette-status-bar__text",
			text: this.footerText ?? "",
		});
		this.resultCountEl = statusBar.createSpan("my-palette-status-bar__count");
		this.updateResultCount(0);
	}

	private renderSuggestions(items: T[]): void {
		const visibleItems = items.slice(0, this.limit);
		this.chooser.values = visibleItems;
		this.chooser.selectedItem = visibleItems.length ? 0 : -1;
		this.extendedSelection.reset(visibleItems.length);
		this.selected = visibleItems[0] ?? null;
		this.resultContainerEl.empty();
		if (!visibleItems.length) {
			this.resultContainerEl.createDiv({
				cls: "suggestion-empty",
				text: this.emptyStateText,
			});
			return;
		}
		for (const [index, item] of visibleItems.entries()) {
			const el = this.resultContainerEl.createDiv("suggestion-item");
			el.setAttribute("data-index", String(index));
			el.setAttribute("role", "option");
			el.setAttribute("aria-selected", String(index === 0));
			if (index === 0) el.addClass("is-selected", "is-active");
			this.renderSuggestion(item, el);
		}
	}

	private handleInputKeyDown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.close();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			const delta = event.key === "ArrowDown" ? 1 : -1;
			const next = Math.max(
				0,
				Math.min(this.chooser.values.length - 1, this.chooser.selectedItem + delta),
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
			this.onChooseSuggestion(item, event);
		}
	}

	private handleHomeEnd(event: KeyboardEvent): false | undefined {
		if (
			event.target !== this.inputEl ||
			event.isComposing ||
			(event.key !== "Home" && event.key !== "End")
		)
			return undefined;

		if (!event.ctrlKey || event.altKey || event.metaKey) {
			const position = event.key === "Home" ? 0 : this.inputEl.value.length;
			this.inputEl.setSelectionRange(position, position);
			return false;
		}
		const count = this.chooser.values.length;
		if (!count) return false;
		this.setSelectedIndex(event.key === "Home" ? 0 : count - 1, true);
		return false;
	}

	private registerPointerActions(): void {
		if (this.pointerActionsRegistered) return;
		this.pointerActionsRegistered = true;
		this.registerSelectionDomEvent(
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
		this.registerSelectionDomEvent(
			this.resultContainerEl,
			"mousedown",
			(event) => {
				// A result-list interaction is the explicit boundary after which the
				// current query is considered used; input blur alone is not enough.
				this.onResultFocus();
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				const index = Number(row.getAttribute("data-index"));
				if (event.button === 0 && this.selectionMode === "extended") {
					// Why: select on press so Obsidian cannot consume the later click;
					// activation is deliberately reserved for the double-click event.
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.extendedSelection.select(index, this.chooser.values.length, {
						toggle: event.ctrlKey || event.metaKey,
						range: event.shiftKey,
					});
					this.setSelectedIndex(index, false);
				} else if (event.button === 1 && this.handlesSuggestionMiddleClick()) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.middleClickRows.add(row);
					this.setSelectedIndex(index, false);
					void this.onSuggestionMiddleClick(item, event);
				} else if (event.button === 2 && this.handlesSuggestionContextMenu()) {
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
		this.registerSelectionDomEvent(
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
				if (item !== undefined && this.handlesSuggestionMiddleClick())
					void this.onSuggestionMiddleClick(item, event);
			},
			true,
		);
		this.registerSelectionDomEvent(
			this.resultContainerEl,
			"click",
			(event) => {
				// 中・右クリック後の click が primary 扱いで onChooseSuggestion へ
				// 落ちてアクティブタブを上書きするため、左以外は確実に消費する。
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
				if (this.selectionMode === "extended") return;
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
				this.onChooseSuggestion(item, event);
			},
			true,
		);
		this.registerSelectionDomEvent(
			this.resultContainerEl,
			"dblclick",
			(event) => {
				if (this.selectionMode !== "extended" || event.button !== 0) return;
				const row = this.suggestionRowAtEvent(event);
				const item = row ? this.itemAtRow(row) : undefined;
				if (!row || item === undefined) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
				this.onChooseSuggestion(item, event);
			},
			true,
		);
		this.registerSelectionDomEvent(
			this.resultContainerEl,
			"contextmenu",
			(event) => {
				if (!this.handlesSuggestionContextMenu()) return;
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
				this.onSuggestionContextMenu(item, event);
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
