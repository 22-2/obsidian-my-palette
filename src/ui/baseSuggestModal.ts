import { App, Modal, type KeymapEventHandler } from "obsidian";

export interface SuggestModalProps<T> {
	title?: string;
	items?: T[];
	placeholder?: string;
	defaultValue?: T;
	initialInput?: string;
	footerText?: string;
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
	private refreshGeneration = 0;
	private pointerActionsRegistered = false;
	private readonly middleClickRows = new WeakSet<Element>();
	private readonly rightClickRows = new WeakSet<Element>();

	constructor(
		{
			items = [],
			defaultValue,
			placeholder = "Search…",
			initialInput = "",
			footerText,
		}: SuggestModalProps<T>,
		app: App,
	) {
		super(app);
		this.items = [...items];
		this.selected = defaultValue ?? null;
		this.initialInput = initialInput;
		this.initialInputReady = !initialInput;
		this.footerText = footerText;
		this.chooser = {
			values: [],
			selectedItem: -1,
			setSelectedItem: (index) => this.setSelectedIndex(index, true),
		};
		this.createInterface(placeholder);
		const scopeHandlers = (this.scope as unknown as { keys?: KeymapEventHandler[] }).keys ?? [];
		for (let index = scopeHandlers.length - 1; index >= 0; index -= 1) {
			const handler = scopeHandlers[index];
			if ((handler.key === "Home" || handler.key === "End") && handler.modifiers === "")
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
			if (index === 0) el.addClass("is-selected");
			this.renderSuggestion(item, el);
		}
	}

	private handleInputKeyDown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			const delta = event.key === "ArrowDown" ? 1 : -1;
			this.setSelectedIndex(this.chooser.selectedItem + delta, true);
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
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				if (event.button === 1 && this.handlesSuggestionMiddleClick()) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.middleClickRows.add(row);
					this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
					void this.onSuggestionMiddleClick(item, event);
				} else if (event.button === 2 && this.handlesSuggestionContextMenu()) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.rightClickRows.add(row);
					this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
				}
			},
			true,
		);
		this.registerSelectionDomEvent(
			this.resultContainerEl,
			"auxclick",
			(event) => {
				if (event.button !== 1) return;
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				event.preventDefault();
				event.stopImmediatePropagation();
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
				const row = this.suggestionRowAtEvent(event);
				if (!row) return;
				if (this.rightClickRows.delete(row)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				const item = this.itemAtRow(row);
				if (item === undefined) return;
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
				this.setSelectedIndex(Number(row.getAttribute("data-index")), false);
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
			row.toggleClass("is-selected", rowIndex === next);
		}
		if (scroll)
			this.resultContainerEl
				.querySelector<HTMLElement>(`.suggestion-item[data-index="${next}"]`)
				?.scrollIntoView({ block: "nearest" });
	}
}
