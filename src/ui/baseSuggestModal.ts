import { App, Modal, Notice, type KeymapEventHandler, type Menu } from "obsidian";
import { PaletteHistoryControls } from "src/palette/components/PaletteHistoryControls";
import { SelectorHelpModal, type SelectorControls } from "src/ui/selectorControls";
import { SuggestionPanel } from "src/ui/suggestionPanel";

export interface SuggestModalProps<T> {
	title?: string;
	items?: T[];
	placeholder?: string;
	defaultValue?: T;
	initialInput?: string;
	footerText?: string;
	selectionMode?: "single" | "extended";
	/** Input/selection modes; see SuggestionPanelProps.interactionModes. */
	interactionModes?: boolean;
	controls?: SelectorControls;
	/** Optional dynamic source used by selectors whose candidates depend on input. */
	search?: (query: string) => T[] | Promise<T[]>;
}

/**
 * Obsidian SuggestModal互換の検索・ライフサイクルを提供する薄いモーダル。
 * 候補の描画と操作は常設ビューと同じ部品に任せ、修正箇所が分岐しないようにする。
 */
export abstract class BaseSuggestModal<T> extends Modal {
	protected items: T[];
	readonly inputEl: HTMLInputElement;
	readonly resultContainerEl: HTMLElement;
	private readonly panel: SuggestionPanel<T>;
	private readonly initialInput: string;
	private refreshGeneration = 0;
	private resultTotal = 0;
	private readonly controls?: SelectorControls;
	private selectorHistoryControls?: PaletteHistoryControls;
	private historyTimer?: number;
	private historyCommitted = false;
	private previewGeneration = 0;
	private previewPending = false;
	private previewEventController?: AbortController;

	constructor(
		{
			items = [],
			defaultValue,
			placeholder = "Search…",
			initialInput = "",
			footerText,
			selectionMode = "single",
			interactionModes,
			controls,
		}: SuggestModalProps<T>,
		app: App,
	) {
		super(app);
		this.items = [...items];
		this.initialInput = initialInput;
		this.controls = controls
			? {
					...controls,
					interactionModes,
					selectionMode,
					context: controls.context ?? footerText,
				}
			: undefined;
		this.panel = new SuggestionPanel(this.modalEl, {
			surface: "modal",
			placeholder,
			initialInput,
			footerText,
			selectionMode,
			interactionModes,
			onInput: () => {
				this.historyCommitted = false;
				this.refreshSuggestions();
				this.scheduleSearchHistory();
			},
			renderSuggestion: (item, el) => this.renderSuggestion(item, el),
			onChoose: (item, event) => this.onChooseSuggestion(item, event),
			onResultFocus: () => {
				this.commitSearchHistory();
				this.selectorHistoryControls?.close();
				this.onResultFocus();
			},
			onMiddleClick: this.handlesSuggestionMiddleClick()
				? (item, event) => this.onSuggestionMiddleClick(item, event)
				: undefined,
			onRowToggle: this.handlesSuggestionRowToggle()
				? (item, event) => this.onSuggestionRowToggle(item, event)
				: undefined,
			onSelectionSpace: this.handlesSelectionSpace()
				? (items) => this.onSelectionSpace(items)
				: undefined,
			onContextMenu: this.handlesSuggestionContextMenu()
				? (item, event) => this.onSuggestionContextMenu(item, event)
				: undefined,
			onEscape: () => this.close(),
		});
		this.panel.selected = defaultValue ?? null;
		this.inputEl = this.panel.inputEl;
		this.resultContainerEl = this.panel.resultContainerEl;
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

	get selected(): T | null {
		return this.panel.selected;
	}
	set selected(item: T | null) {
		this.panel.selected = item;
	}
	get limit(): number {
		return this.panel.limit;
	}
	set limit(limit: number) {
		this.panel.limit = limit;
	}
	get emptyStateText(): string {
		return this.panel.emptyStateText;
	}
	set emptyStateText(text: string) {
		this.panel.emptyStateText = text;
	}
	protected get query(): string {
		return this.panel.query;
	}
	protected set query(query: string) {
		this.panel.query = query;
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.removeClass("modal");
		this.modalEl.addClass("prompt", "my-palette-suggest-modal");
		// ModalはComponentを継承しないため、開閉に合わせて部品のイベントを管理する。
		// 同じインスタンスを再度開いてもフッターやハンドラを増やさない。
		this.panel.load();
		this.registerPreviewTransparency();
		if (this.handlesSuggestionPreview())
			this.registerSelectionDomEvent(
				this.inputEl,
				"keydown",
				(event) => this.handlePreviewKey(event),
				true,
			);
		this.historyCommitted = false;
		if (this.controls) {
			const controls = this.controls;
			this.selectorHistoryControls = new PaletteHistoryControls({
				plugin: controls.plugin,
				surface: "palette",
				inputEl: this.inputEl,
				containerEl: this.inputEl.parentElement ?? this.modalEl,
				hostEl: this.modalEl,
				getContext: (input) => ({
					query: input,
					category: controls.category,
					includeIgnored: false,
				}),
				// Restoring a history entry only replaces the query. In particular, a
				// saved MOC prefix must stay intact and must never trigger insertion.
				apply: (result) => {
					this.cancelHistoryTimer();
					this.historyCommitted = false;
					this.selectorHistoryControls?.close();
					this.panel.setInput(result.input, "end");
					this.focusSearchInput();
					this.refreshSuggestions();
				},
				populateActions: (menu, event) => this.populateSelectorActions(menu, event),
				showHelp: () => new SelectorHelpModal(this.app, controls).open(),
				focusInput: () => this.focusSearchInput(),
			});
		}
		this.onSelectionModalOpen();
		this.focusSearchInput();
		if (this.initialInput) {
			const generation = this.refreshGeneration;
			window.setTimeout(() => {
				if (generation !== this.refreshGeneration || !this.inputEl.isConnected) return;
				this.refreshSuggestions();
				const [selectionStart, selectionEnd] = this.getInitialInputSelectionRange();
				this.inputEl.setSelectionRange(selectionStart, selectionEnd);
			}, 0);
		} else {
			this.refreshSuggestions();
		}
	}

	onClose(): void {
		this.containerEl.removeClass("my-palette-modal-container", "is-preview-hidden");
		this.previewEventController?.abort();
		this.previewEventController = undefined;
		this.previewGeneration += 1;
		this.refreshGeneration += 1;
		this.cancelHistoryTimer();
		this.selectorHistoryControls?.destroy();
		this.selectorHistoryControls = undefined;
		this.onSelectionModalClose();
		this.panel.unload();
		super.onClose();
	}

	abstract getSuggestions(query: string): T[] | Promise<T[]>;
	abstract renderSuggestion(item: T, el: HTMLElement): void;

	onChooseSuggestion(item: T, event: MouseEvent | KeyboardEvent): void {
		this.commitSearchHistory();
		this.selected = item;
		void this.onItemActivated(item, event);
	}

	protected onSelectionModalOpen(): void {}

	private registerPreviewTransparency(): void {
		this.containerEl.addClass("my-palette-modal-container");
		const restore = (returnFocus = false) => {
			this.containerEl.removeClass("is-preview-hidden");
			if (returnFocus && this.inputEl.isConnected)
				this.inputEl.focus({ preventScroll: true });
		};
		this.panel.registerDomEvent(
			this.modalEl,
			"keydown",
			(event) => {
				if (
					event.isComposing ||
					!event.altKey ||
					event.ctrlKey ||
					event.metaKey ||
					event.shiftKey ||
					event.key.toLowerCase() !== "h"
				)
					return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.containerEl.addClass("is-preview-hidden");
			},
			true,
		);
		const ownerWindow = this.modalEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		const eventController = new AbortController();
		this.previewEventController = eventController;
		// Key release may happen outside the input; blur covers switching apps
		// while holding the shortcut, where the release never reaches this window.
		ownerWindow.addEventListener(
			"keyup",
			(event) => {
				if (event.key.toLowerCase() === "h" || event.key === "Alt") restore(true);
			},
			{ capture: true, signal: eventController.signal },
		);
		ownerWindow.addEventListener("blur", () => restore(), { signal: eventController.signal });
	}

	protected handlesSuggestionPreview(): boolean {
		return false;
	}

	protected async onSuggestionPreview(_item: T): Promise<void> {}

	private handlePreviewKey(event: KeyboardEvent): void {
		const cursorIsAtEnd =
			this.inputEl.selectionStart === this.inputEl.value.length &&
			this.inputEl.selectionEnd === this.inputEl.value.length;
		if (
			event.key !== "ArrowRight" ||
			event.isComposing ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey ||
			event.shiftKey ||
			(!this.inputEl.readOnly && !cursorIsAtEnd)
		)
			return;
		event.preventDefault();
		event.stopImmediatePropagation();
		const item = this.getSelectedItem();
		if (item === undefined || event.repeat || this.previewPending) return;
		this.commitSearchHistory();
		void this.previewSuggestion(item);
	}

	private async previewSuggestion(item: T): Promise<void> {
		this.previewPending = true;
		const generation = this.previewGeneration;
		const selectionStart = this.inputEl.selectionStart;
		const selectionEnd = this.inputEl.selectionEnd;
		const restoreFocus = () => {
			if (generation !== this.previewGeneration || !this.inputEl.isConnected) return;
			// Focus the DOM input directly: switching to input mode would discard
			// the selector's read-only selection mode after every preview.
			this.inputEl.focus({ preventScroll: true });
			this.inputEl.setSelectionRange(selectionStart, selectionEnd);
		};
		try {
			await this.onSuggestionPreview(item);
		} catch (error) {
			console.error("Failed to preview selection", error);
			new Notice(error instanceof Error ? error.message : "Failed to preview selection.");
		} finally {
			this.previewPending = false;
			restoreFocus();
			window.setTimeout(restoreFocus, 0);
		}
	}

	protected populateSelectorActions(menu: Menu, event: MouseEvent): void {
		const candidate = this.getSelectedItem();
		const controls = this.controls;
		if (!controls) return;
		menu.addItem((item) =>
			item
				.setTitle(`${controls.actionLabel} selected`)
				.setIcon("corner-down-left")
				.setDisabled(candidate === undefined)
				.onClick(() => {
					if (candidate !== undefined) this.onChooseSuggestion(candidate, event);
				}),
		);
	}

	protected commitSearchHistory(): void {
		this.cancelHistoryTimer();
		if (!this.controls || this.historyCommitted || !this.inputEl.value.trim()) return;
		this.controls.plugin.recordSearch(this.inputEl.value, this.controls.category);
		this.historyCommitted = true;
	}

	private scheduleSearchHistory(): void {
		this.cancelHistoryTimer();
		const history = this.controls?.plugin.settings.searchHistory;
		if (!history?.enabled || history.addDelayMs <= 0) return;
		this.historyTimer = window.setTimeout(() => this.commitSearchHistory(), history.addDelayMs);
	}

	private cancelHistoryTimer(): void {
		if (this.historyTimer !== undefined) window.clearTimeout(this.historyTimer);
		this.historyTimer = undefined;
	}
	protected onSelectionModalClose(): void {}
	protected handlesSuggestionMiddleClick(): boolean {
		return false;
	}
	protected handlesSuggestionContextMenu(): boolean {
		return false;
	}
	protected handlesSuggestionRowToggle(): boolean {
		return false;
	}
	protected handlesSelectionSpace(): boolean {
		return false;
	}
	protected async onSuggestionMiddleClick(_item: T, _event: MouseEvent): Promise<void> {}
	protected onSuggestionContextMenu(_item: T, _event: MouseEvent): void {}
	protected onSuggestionRowToggle(_item: T, _event: MouseEvent): void {}
	protected onSelectionSpace(_items: T[]): void {}
	protected onResultFocus(): void {}
	protected getSelectedItems(): T[] {
		return this.panel.getSelectedItems();
	}
	protected getSelectedItem(): T | undefined {
		return this.panel.getSelectedItem();
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
		this.resultTotal = total;
		this.panel.updateResultCount(total);
	}

	protected updateFooterText(text: string): void {
		this.panel.updateFooterText(text);
	}
	protected updateMatchQuery(query: string): void {
		this.query = query;
	}
	focusSearchInput(): void {
		this.panel.focusSearchInput();
	}
	protected updatePlaceholder(placeholder: string): void {
		this.panel.updatePlaceholder(placeholder);
	}

	protected registerSelectionDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	): void {
		// モーダル専用のプレビュー操作も、閉じた時点で共通部品と一緒に解除する。
		this.panel.registerDomEvent(el, type, callback, options);
	}

	/**
	 * Rerender for the current input and keep the selection and cursor on the same
	 * items. Hosts that stay open after an action (multi-toggle selectors) need
	 * this because a normal rerender resets the selection to the first row and
	 * loses the user's place in the list.
	 */
	protected refreshSuggestionsKeepingSelection(isSameItem: (a: T, b: T) => boolean): void {
		const scrollTop = this.resultContainerEl.scrollTop;
		const selected = this.panel.getSelectedItems();
		const active = this.panel.getSelectedItem();
		this.refreshSuggestions(() => {
			this.resultContainerEl.scrollTop = scrollTop;
			const { values } = this.panel.chooser;
			const indexOf = (item: T) => values.findIndex((value) => isSameItem(value, item));
			this.panel.restoreSelection(
				selected.map(indexOf).filter((index) => index >= 0),
				active === undefined ? -1 : indexOf(active),
			);
		});
	}

	/**
	 * Redraw visible rows in place. Multi-toggle selectors use this after a check
	 * changes, since a full refresh would move the cursor back to the first row
	 * and, for asynchronous sources, search again.
	 */
	protected rerenderVisibleSuggestions(): void {
		this.panel.rerenderRows();
	}

	protected refreshSuggestions(afterRender?: () => void): void {
		if (!this.inputEl.isConnected) return;
		const query = this.inputEl.value;
		const generation = ++this.refreshGeneration;
		this.query = query;
		this.emptyStateText = "No suggestions";
		const suggestions = this.getSuggestions(query);
		void Promise.resolve(suggestions).then((items) => {
			if (generation !== this.refreshGeneration || !this.inputEl.isConnected) return;
			// パレットはプレフィックスを除いた検索語を使い、検索側の総件数を表示する。
			// 生入力や表示件数で上書きすると強調表示と件数が検索モードによって変わる。
			this.panel.setResults({
				items,
				total: this.resultTotal,
				query: this.query,
				error: this.emptyStateText,
			});
			afterRender?.();
		});
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
		const count = this.panel.chooser.values.length;
		if (!count) return false;
		this.onResultFocus();
		this.panel.setSelectedIndex(event.key === "Home" ? 0 : count - 1, true);
		return false;
	}
}
