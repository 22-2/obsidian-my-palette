import { App, Modal, Notice } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { PaletteHistoryControls } from "src/palette/components/PaletteHistoryControls";
import { SelectorHelpModal, type SelectorControls } from "src/ui/selectorControls";
import { SuggestionPanel, type SuggestionPanelView } from "src/ui/suggestionPanel";
import type { PanelSwitch, PanelSwitchOptions } from "src/ui/panelSwitch";
import { DEFAULT_HOTKEYS, matchesHotkey, type PaletteHotkeys } from "src/ui/hotkeys";
import { ICONS } from "src/ui/icons";
import { logger } from "src/shared/logger";
import { getScopeHandlers } from "src/platform/obsidianInternals";
import { t } from "src/i18n";

export interface SuggestModalProps<T> {
	getHotkeys?: () => PaletteHotkeys;
	title?: string;
	items?: T[];
	placeholder?: string;
	defaultValue?: T;
	initialInput?: string;
	footerText?: string;
	selectionMode?: "single" | "extended";
	activateOnClick?: (item: T) => boolean;
	/** 入力モードと選択モード。SuggestionPanelProps.interactionModes を参照。 */
	interactionModes?: boolean;
	controls?: SelectorControls;
	/** 候補が入力に依存するセレクターが使う、任意の動的な供給元。 */
	search?: (query: string) => T[] | Promise<T[]>;
}

/**
 * Obsidian の SuggestModal と互換の検索とライフサイクルを提供する薄いモーダル。
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
	private readonly getHotkeys: () => PaletteHotkeys;

	constructor(
		{
			items = [],
			defaultValue,
			placeholder = t("modal.placeholderDefault"),
			initialInput = "",
			footerText,
			selectionMode = "single",
			activateOnClick,
			interactionModes,
			controls,
			getHotkeys,
		}: SuggestModalProps<T>,
		app: App,
	) {
		super(app);
		this.items = [...items];
		this.initialInput = initialInput;
		this.getHotkeys =
			getHotkeys ?? (() => controls?.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS);
		this.controls = controls
			? {
					...controls,
					interactionModes,
					selectionMode,
					context: controls.context ?? footerText,
				}
			: undefined;
		this.panel = new SuggestionPanel(this.modalEl, {
			getHotkeys: this.getHotkeys,
			surface: "modal",
			previewContainerEl: this.containerEl,
			placeholder,
			initialInput,
			footerText,
			selectionMode,
			activateOnClick,
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
			onEscape: () => this.onSuggestionEscape(),
			onEmptyBackspace: () => this.onEmptyBackspace(),
			onTab: (item) => this.onSuggestionTab(item),
			onModeChipClick: () => this.onModeChipClick(),
			sectionOf: (item) => this.sectionOf(item),
		});
		this.panel.selected = defaultValue ?? null;
		this.inputEl = this.panel.inputEl;
		this.resultContainerEl = this.panel.resultContainerEl;
		const scopeHandlers = getScopeHandlers(this.scope);
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
		// Modal は Component を継承しないため、開閉に合わせて部品のイベントを管理する。
		// 同じインスタンスを再度開いても、フッターやハンドラを増やさない。
		this.panel.load();
		this.containerEl.addClass("my-palette-modal-container");
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
				historyCategories: [controls.category],
				inputEl: this.inputEl,
				containerEl: this.inputEl.parentElement ?? this.modalEl,
				hostEl: this.modalEl,
				getContext: (input) => ({
					query: input,
					category: controls.category,
					includeIgnored: false,
				}),
				// 履歴の項目を復元するのは、検索語を置き換えるだけ。特に、保存された MOC の接頭辞は
				// そのまま残り、挿入を起こしてはいけない。
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
				getSwitches: () => this.switches,
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

	protected handlesSuggestionPreview(): boolean {
		return false;
	}

	protected async onSuggestionPreview(_item: T): Promise<void> {}

	private handlePreviewKey(event: KeyboardEvent): void {
		const cursorIsAtEnd =
			this.inputEl.selectionStart === this.inputEl.value.length &&
			this.inputEl.selectionEnd === this.inputEl.value.length;
		const hotkey = this.getHotkeys().preview;
		const usesCursorKey = hotkey?.key === "ArrowRight" && hotkey.modifiers.length === 0;
		if (
			!matchesHotkey(event, hotkey) ||
			(usesCursorKey && !this.inputEl.readOnly && !cursorIsAtEnd)
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
			// DOM の入力欄に直接フォーカスする。入力モードに切り替えると、プレビューのたびに
			// セレクターの読み取り専用の選択モードが失われてしまうため。
			this.inputEl.focus({ preventScroll: true });
			this.inputEl.setSelectionRange(selectionStart, selectionEnd);
		};
		try {
			await this.onSuggestionPreview(item);
		} catch (error) {
			logger.error("Failed to preview selection", error);
			new Notice(error instanceof Error ? error.message : t("modal.error.previewFailed"));
		} finally {
			this.previewPending = false;
			restoreFocus();
			window.setTimeout(restoreFocus, 0);
		}
	}

	protected populateSelectorActions(menu: PaletteMenu, event: MouseEvent): void {
		const candidate = this.getSelectedItem();
		const controls = this.controls;
		if (!controls) return;
		menu.addItem((item) =>
			item
				.setTitle(t("selector.actionSelected", { action: controls.actionLabel }))
				.setIcon(ICONS.confirm)
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

	/** 再開するパレットのために、次の結果を行とスクロール位置に合わせる。 */
	protected restoreResultView(view: SuggestionPanelView): void {
		this.panel.restoreView(view);
	}

	/** モーダルがまだ開いている間に読む、選ばれた行とスクロール位置。 */
	protected currentResultView(): SuggestionPanelView {
		return this.panel.currentView;
	}
	protected onSuggestionEscape(): void {
		this.close();
	}
	protected onEmptyBackspace(): boolean {
		return false;
	}
	protected onSuggestionTab(_item: T): boolean {
		return false;
	}
	protected onModeChipClick(): void {}
	protected sectionOf(_item: T): string | undefined {
		return undefined;
	}
	/**
	 * 一覧をすぐに空にする。遅いプロバイダー(Everything)は、答えるまで前の画面の行を残してしまい、
	 * 間違った画面に見えるため。
	 */
	protected clearSuggestions(text: string): void {
		this.panel.setResults({ items: [], total: 0, error: text });
	}
	protected setModeChip(chip?: { icon: string; label: string; title: string }): void {
		this.panel.setModeChip(chip);
	}
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
	protected showActiveRowContextMenu(): void {
		this.panel.showActiveRowContextMenu();
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

	/** onSelectionModalOpen から呼ぶ。リスナーはモーダルを閉じるときに解放される。 */
	protected addSwitch(options: PanelSwitchOptions): PanelSwitch {
		return this.panel.addSwitch(options);
	}

	/** これまでに追加されたフッターのスイッチを、追加された順に。 */
	protected get switches(): PanelSwitch[] {
		return this.panel.switchList;
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
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => unknown,
		options?: boolean | AddEventListenerOptions,
	): void {
		// モーダル専用のプレビュー操作も、閉じた時点で共通部品と一緒に解除する。
		this.panel.registerDomEvent(el, type, callback, options);
	}

	/**
	 * 同じ入力で描き直し、選択とカーソルを同じ項目に保つ。操作の後も開いたままになるホスト
	 * (複数切り替えのセレクター)に必要。通常の描き直しは選択を先頭の行に戻し、
	 * 一覧での位置を失ってしまうため。
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
	 * 見えている行をその場で描き直す。チェックが変わった後に複数切り替えのセレクターが使う。
	 * 全体の更新だとカーソルが先頭の行に戻り、非同期の供給元では再び検索してしまうため。
	 */
	protected rerenderVisibleSuggestions(): void {
		this.panel.rerenderRows();
	}

	protected refreshSuggestions(afterRender?: () => void): void {
		if (!this.inputEl.isConnected) return;
		const query = this.inputEl.value;
		const generation = ++this.refreshGeneration;
		this.query = query;
		this.emptyStateText = t("suggest.noSuggestions");
		const suggestions = this.getSuggestions(query);
		void Promise.resolve(suggestions).then((items) => {
			if (generation !== this.refreshGeneration || !this.inputEl.isConnected) return;
			// パレットはプレフィックスを除いた検索語を使い、検索側の総件数を表示する。
			// 生の入力や表示件数で上書きすると、強調表示と件数が検索モードによって変わるため。
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
