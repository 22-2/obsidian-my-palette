import { Component, Notice, setIcon, setTooltip } from "obsidian";
import { ExtendedSelection } from "src/ui/extendedSelection";
import { InteractionModes } from "src/ui/interactionModes";
import {
	DEFAULT_HOTKEYS,
	matchesHotkey,
	type PaletteHotkey,
	type PaletteHotkeys,
} from "src/ui/hotkeys";
import { markKeyboardMenuEvent } from "src/ui/menus";
import { PanelSwitch, type PanelSwitchOptions } from "src/ui/panelSwitch";
import { ICONS } from "src/ui/icons";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";

export interface SuggestionPanelProps<T> {
	getHotkeys?: () => PaletteHotkeys;
	initialInput?: string;
	placeholder?: string;
	footerText?: string;
	limit?: number;
	surface?: "modal" | "view";
	/** モーダルのホストは背景ごと含める。ワークスペースのビューは自分のパネルだけを隠す。 */
	previewContainerEl?: HTMLElement;
	selectionMode?: "single" | "extended";
	/**
	 * 入力と選択のモードを分ける。1キーの一覧操作(チェックのスペース、戻る f)を持つセレクターだけが
	 * 有効にする。それ以外では、入力中も先頭の行を強調したままにし、Enter ですぐ実行でき、
	 * 最初の矢印で先頭を飛び越えられるようにする。
	 */
	interactionModes?: boolean;
	onInput: (input: string) => void;
	renderSuggestion: (item: T, el: HTMLElement, query: string) => void;
	onChoose: (item: T, event: MouseEvent | KeyboardEvent) => void | Promise<void>;
	/** ナビゲーションの項目は、拡張選択の一覧の中でも1回のクリックで有効になる。 */
	activateOnClick?: (item: T) => boolean;
	onResultFocus?: () => void;
	onMiddleClick?: (item: T, event: MouseEvent) => void | Promise<void>;
	/** 行の中で `data-row-toggle` を付けた要素を、左クリックしたとき。 */
	onRowToggle?: (item: T, event: MouseEvent) => void;
	/** 選択モードのスペース。ない場合、スペースは拡張選択を切り替える。 */
	onSelectionSpace?: (selectedItems: T[], event: KeyboardEvent) => void;
	onContextMenu?: (item: T, event: MouseEvent, selectedItems: T[]) => void;
	onEscape?: () => void;
	/** 強調行でモードに入るキー。true を返すとキーを消費する(Home がモードに入る)。 */
	onTab?: (item: T) => boolean;
	/**
	 * プレビューのキーで選んだ行を見せる。ホストが対象外と判断した行は、何もせずに返す。
	 * 入力欄のフォーカスは、終わったあとにパネルが戻す。
	 */
	onPreview?: (item: T) => Promise<void> | void;
	/** 空の入力での Backspace。true を返すとキーを消費する。 */
	onEmptyBackspace?: () => boolean;
	/** 入力欄の左に出るモードのチップのクリック。 */
	onModeChipClick?: () => void;
	/** 前の行と違うセクションの行には、その上に見出しを付ける。 */
	sectionOf?: (item: T) => string | undefined;
	/** フッターの文脈テキスト(元のノートの名前など)の左クリック。 */
	onFooterTextClick?: (event: MouseEvent) => void;
	onFooterTextContextMenu?: (event: MouseEvent) => void;
	onReady?: () => void;
}

export interface SuggestionPanelResults<T> {
	items: T[];
	total?: number;
	error?: string;
	/** 検索中。一覧が空のあいだは、エラーや「候補がありません」の代わりにスピナーを出す。 */
	loading?: boolean;
	/** ホストが一致の前にモードの接頭辞を取り除くとき、解析済みの検索語。 */
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

export interface SuggestionPanelView {
	activeIndex: number;
	scrollTop: number;
}

interface SuggestionChooser<T> {
	values: T[];
	selectedItem: number;
}

/**
 * モーダルとワークスペースのビューの外枠が共有する、入力と一覧の面。
 * Obsidian の Modal や ItemView のライフサイクルは、意図的に知らない。面がどこに置かれるかと、
 * 操作の成功が何を意味するかは、ホストが決める。
 */
export class SuggestionPanel<T> extends Component {
	readonly inputEl: HTMLInputElement;
	readonly resultContainerEl: HTMLElement;
	readonly statusBarEl: HTMLElement;
	readonly statusTextEl: HTMLElement;
	readonly resultCountEl: HTMLElement;
	private readonly modeChipEl: HTMLElement;
	readonly chooser: SuggestionChooser<T> = { values: [], selectedItem: -1 };
	private pendingView?: { view: SuggestionPanelView; matches?: (item: T) => boolean };
	limit: number;
	selected: T | null = null;
	query = "";
	emptyStateText = t("suggest.noSuggestions");

	private readonly rootEl: HTMLElement;
	private readonly previewContainerEl: HTMLElement;
	private readonly props: SuggestionPanelProps<T>;
	private readonly initialInput: string;
	private readonly selectionMode: "single" | "extended";
	private readonly extendedSelection = new ExtendedSelection();
	private readonly leftClickRows = new WeakSet<Element>();
	private readonly middleClickRows = new WeakSet<Element>();
	private readonly rightClickRows = new WeakSet<Element>();
	private resultsLayout?: SuggestionPanelResultsLayout<T>;
	private readonly modes?: InteractionModes;
	private readonly switches = new Map<string, PanelSwitch>();
	private previewGeneration = 0;
	private previewPending = false;

	constructor(rootEl: HTMLElement, props: SuggestionPanelProps<T>) {
		super();
		this.rootEl = rootEl;
		this.previewContainerEl = props.previewContainerEl ?? rootEl;
		this.props = props;
		this.initialInput = props.initialInput ?? "";
		this.selectionMode = props.selectionMode ?? "single";
		this.limit = props.limit ?? 50;
		this.rootEl.empty();
		const surface = props.surface ?? "modal";
		this.rootEl.addClass("my-palette-panel", `my-palette-panel--${surface}`);
		// Obsidian の `prompt` クラスはモーダルの大きさを強制する。常設のビューには独自の外枠を与え、
		// 狭いサイドバーがその幅の制約を引き継がないようにする。
		if (surface === "modal") this.rootEl.addClass("prompt");
		const inputContainer = this.rootEl.createDiv("prompt-input-container");
		if (surface === "view") {
			const searchIcon = inputContainer.createSpan("my-palette-panel__search-icon");
			setIcon(searchIcon, ICONS.search);
		}
		this.modeChipEl = inputContainer.createDiv({
			cls: "my-palette-mode-chip",
			attr: { role: "button", hidden: "" },
		});
		this.inputEl = inputContainer.createEl("input", {
			cls: "prompt-input",
			attr: {
				autocapitalize: "off",
				spellcheck: "false",
				enterkeyhint: "done",
				type: "text",
				placeholder: props.placeholder ?? t("modal.placeholderDefault"),
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
		if (props.interactionModes)
			this.modes = new InteractionModes(this.rootEl, this.inputEl, () => this.hotkeys);
		this.statusTextEl = this.statusBarEl.createSpan({
			cls: "my-palette-status-bar__text",
			text: props.footerText ?? "",
		});
		this.resultCountEl = this.statusBarEl.createSpan("my-palette-status-bar__count");
		this.updateResultCount(0);
	}

	onload(): void {
		this.registerPreviewTransparency();
		const modes = this.modes;
		if (modes) {
			modes.set("input");
			this.registerDomEvent(this.inputEl, "mousedown", () => modes.set("input"));
		}
		this.registerDomEvent(this.inputEl, "input", () => this.props.onInput(this.inputEl.value));
		this.registerDomEvent(this.inputEl, "keydown", (event) => this.handleInputKeyDown(event));
		this.registerDomEvent(this.modeChipEl, "click", (event) => {
			event.preventDefault();
			this.props.onModeChipClick?.();
		});
		this.registerPointerActions();
		this.registerFooterTextActions();
		this.props.onReady?.();
	}

	onunload(): void {
		this.switches.clear();
		// 閉じた後に終わったプレビューは、入力欄へフォーカスを戻さない。
		this.previewGeneration += 1;
		this.previewContainerEl.removeClass("my-palette-preview-surface", "is-preview-hidden");
	}

	private get hotkeys(): PaletteHotkeys {
		return this.props.getHotkeys?.() ?? DEFAULT_HOTKEYS;
	}

	private registerPreviewTransparency(): void {
		const container = this.previewContainerEl;
		let held: PaletteHotkey | undefined;
		container.addClass("my-palette-preview-surface");
		const restore = (returnFocus = false) => {
			// この窓の他のパネルも同じ窓を共有する。隠れているパネルだけがフォーカスを戻す。
			if (!container.hasClass("is-preview-hidden")) return;
			container.removeClass("is-preview-hidden");
			held = undefined;
			if (returnFocus && this.inputEl.isConnected)
				this.inputEl.focus({ preventScroll: true });
		};
		this.registerDomEvent(
			this.rootEl,
			"keydown",
			(event) => {
				const hotkey = this.hotkeys.hidePreview;
				if (!matchesHotkey(event, hotkey)) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				held = hotkey ?? undefined;
				container.addClass("is-preview-hidden");
			},
			true,
		);
		const ownerWindow = this.rootEl.ownerDocument.defaultView;
		if (!ownerWindow) return;
		// フォーカスは、フェードしたパネルから離れることがある。キーを離すことと、アプリの切り替えでも戻す。
		this.registerDomEvent(
			ownerWindow,
			"keyup",
			(event) => {
				if (!held) return;
				const key = event.key === " " ? "Space" : event.key;
				const modifier = key === "Control" ? "Ctrl" : key;
				if (
					key.toUpperCase() === held.key.toUpperCase() ||
					held.modifiers.some((item) => item === modifier)
				)
					restore(true);
			},
			true,
		);
		this.registerDomEvent(ownerWindow, "blur", () => restore());
	}

	setResults(results: SuggestionPanelResults<T>): void {
		// Why: 検索中の空の一覧は、開き直したビューを消費しない。最初の結果が届いてから適用する。
		if (results.loading) {
			this.renderResults(results);
			return;
		}
		const view = this.pendingView;
		this.pendingView = undefined;
		this.renderResults(results);
		if (view) this.applyView(view.view, view.matches);
	}

	/** 次の結果にビューを適用する。開き直したパレットが、同じ行とスクロール位置に着地するように。 */
	restoreView(view: SuggestionPanelView, matches?: (item: T) => boolean): void {
		this.pendingView = { view, matches };
	}

	/** 選ばれた行とスクロール位置。開き直されるかもしれないパレットのために。 */
	get currentView(): SuggestionPanelView {
		return {
			activeIndex: this.chooser.selectedItem,
			scrollTop: this.resultContainerEl.scrollTop,
		};
	}

	private applyView(
		{ activeIndex, scrollTop }: SuggestionPanelView,
		matches?: (item: T) => boolean,
	): void {
		const count = this.chooser.values.length;
		const matchedIndex = matches ? this.chooser.values.findIndex(matches) : -1;
		if (matchedIndex >= 0) activeIndex = matchedIndex;
		if (count > 0) this.setSelectedIndex(Math.min(Math.max(activeIndex, 0), count - 1), true);
		this.resultContainerEl.scrollTop = scrollTop;
	}

	private renderResults({
		items,
		total = items.length,
		error,
		query,
		loading = false,
	}: SuggestionPanelResults<T>): void {
		this.emptyStateText = error ?? t("suggest.noSuggestions");
		// ホストは接頭辞を解析するかもしれない。強調表示は、一致に使うのと同じ文字列を使う必要がある。
		this.query = query ?? this.inputEl.value;
		this.chooser.values = items.slice(0, this.limit);
		this.chooser.selectedItem = this.chooser.values.length ? 0 : -1;
		this.extendedSelection.reset(this.chooser.values.length);
		this.selected = this.chooser.values[0] ?? null;
		this.updateResultCount(total);
		this.resultContainerEl.empty();
		if (this.resultsLayout) {
			// 描画の形は、このパネルではなくレイアウトが持つ。行の番号と選択はパネルが持つ。
			// キーボードもポインターも、表示されている並び順で動くようにする。
			this.resultsLayout.render(
				this.resultContainerEl,
				this.chooser.values,
				this.query,
				(row, index) => this.decorateRow(row, index),
			);
		}
		if (!this.chooser.values.length) {
			if (loading) this.renderLoadingState();
			else
				this.resultContainerEl.createDiv({
					cls: "suggestion-empty",
					text: this.emptyStateText,
				});
			return;
		}
		if (this.resultsLayout) return;
		let section: string | undefined;
		for (const [index, item] of this.chooser.values.entries()) {
			const nextSection = this.props.sectionOf?.(item);
			if (nextSection && nextSection !== section)
				// 見出しは `.suggestion-item` ではないので、行の番号と矢印の移動は、
				// 選べる結果だけを数え続ける。
				this.resultContainerEl.createDiv({
					cls: "my-palette-section-heading",
					text: nextSection,
					attr: { role: "presentation" },
				});
			section = nextSection;
			const el = this.resultContainerEl.createDiv("suggestion-item");
			this.decorateRow(el, index);
			this.props.renderSuggestion(item, el, this.query);
		}
	}

	/** 検索中の空の一覧。すぐ終わる検索で点滅しないよう、スピナーは CSS で少し遅れて現れる。 */
	private renderLoadingState(): void {
		const loadingEl = this.resultContainerEl.createDiv({
			cls: "suggestion-empty my-palette-loading",
			attr: { role: "status", "aria-label": t("view.searching") },
		});
		loadingEl.createDiv({ cls: "my-palette-spinner", attr: { "aria-hidden": "true" } });
	}

	/**
	 * 見えている行をその場で描き直す。setResults と違い、カーソル、拡張選択、スクロール位置を保つ。
	 * 一覧そのものは変えずに、チェックマークのように見た目だけが変わるホストのために。
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
		// 履歴と元のノートの操作は、続きの編集のために検索語を置き換える。
		this.modes?.set("input");
		this.inputEl.value = input;
		if (selection === "all") this.inputEl.select();
		if (selection === "end") this.inputEl.setSelectionRange(input.length, input.length);
	}

	/** 入力がどのモードを検索しているかを示す。Home に戻るときは省略する。 */
	setModeChip(chip?: { icon: string; label: string; title: string }): void {
		this.modeChipEl.empty();
		this.modeChipEl.toggleAttribute("hidden", !chip);
		this.rootEl.toggleClass("has-mode-chip", Boolean(chip));
		if (!chip) return;
		setIcon(this.modeChipEl.createSpan("my-palette-mode-chip__icon"), chip.icon);
		this.modeChipEl.createSpan({ cls: "my-palette-mode-chip__label", text: chip.label });
		setTooltip(this.modeChipEl, t("panel.modeChip.title", { title: chip.title }));
	}

	focusSearchInput(): void {
		this.modes?.set("input");
		if (this.inputEl.isConnected) this.inputEl.focus({ preventScroll: true });
	}

	private focusResults(): void {
		this.modes?.set("selection");
		this.props.onResultFocus?.();
	}

	/**
	 * Why: 入力欄からフォーカスが離れた後に、一覧の余白を押すとフォーカスが何にも移るため、
	 * 入力欄で処理される矢印キーが、行をクリックするまで届かなくなっていた。フォーカスを入力欄に戻す。
	 * モードがあれば選択モードにして、入力は止めたまま、結果の押下のように履歴は記録しない。
	 */
	private restoreFocusFromListSpace(event: MouseEvent): void {
		if (event.button !== 0) return;
		const target = event.target as Node | null;
		// 表のヘッダーのボタンなどは、それ自身のフォーカスの挙動を保つ。
		if (
			target?.instanceOf(Element) &&
			target.closest("button, input, select, textarea, a, [tabindex]")
		)
			return;
		event.preventDefault();
		this.modes?.set("selection");
		if (this.inputEl.isConnected) this.inputEl.focus({ preventScroll: true });
	}

	updatePlaceholder(placeholder: string): void {
		this.inputEl.placeholder = placeholder;
	}

	updateFooterText(text: string, icon?: string): void {
		this.statusTextEl.empty();
		setTooltip(this.statusTextEl, text);
		if (icon) setIcon(this.statusTextEl.createSpan("my-palette-status-bar__icon"), icon);
		this.statusTextEl.appendText(text);
	}

	private registerFooterTextActions(): void {
		const { onFooterTextClick, onFooterTextContextMenu } = this.props;
		if (!onFooterTextClick && !onFooterTextContextMenu) return;
		this.statusTextEl.addClass("is-interactive");
		// Why: フッターの押下で入力欄からフォーカスが離れると、一覧の余白を押したときと同じく、
		// 矢印キーが届かなくなってしまうため。
		this.registerDomEvent(this.statusTextEl, "mousedown", (event) => event.preventDefault());
		if (onFooterTextClick)
			this.registerDomEvent(this.statusTextEl, "click", (event) => onFooterTextClick(event));
		if (onFooterTextContextMenu)
			this.registerDomEvent(this.statusTextEl, "contextmenu", (event) => {
				event.preventDefault();
				onFooterTextContextMenu(event);
			});
	}

	/**
	 * オプションのメニューに並び、切り替えられる項目を追加する。読み込みのたびに追加し直す。同じ id の
	 * 項目があれば、前のスイッチを置き換える。
	 */
	addSwitch(options: PanelSwitchOptions): PanelSwitch {
		// モーダルのフッターは既定で隠れる。スイッチのあるパネルは、元のテキストと件数を入れた
		// フッターを残す。
		this.rootEl.addClass("has-status-bar");
		const panelSwitch = new PanelSwitch(options);
		this.switches.set(options.id, panelSwitch);
		return panelSwitch;
	}

	/** オプションのメニューのために、追加された順のスイッチ。 */
	get switchList(): PanelSwitch[] {
		return [...this.switches.values()];
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

	/** キーのモードの操作があれば実行する。キーが消費されたら true。 */
	private handleModeCommand(event: KeyboardEvent): boolean {
		const command = this.modes?.command(event, this.chooser.selectedItem <= 0);
		if (command === "to-input") {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.focusSearchInput();
			return true;
		}
		if (command === "enter-list") {
			event.preventDefault();
			event.stopPropagation();
			// 最初の矢印は、結果を飛ばさず、前の操作から残っている選択も広げずに、行0へフォーカスを移す。
			this.focusResults();
			this.extendedSelection.reset(this.chooser.values.length);
			this.setSelectedIndex(0, true);
			return true;
		}
		if (command !== "selection-space") return false;
		const { onSelectionSpace } = this.props;
		// 単一の選択には切り替えるものがないので、読み取り専用の入力がそのキーを捨てる。
		if (!onSelectionSpace && this.selectionMode !== "extended") return false;
		event.preventDefault();
		event.stopImmediatePropagation();
		if (event.repeat) return true;
		if (onSelectionSpace) {
			onSelectionSpace(this.getSelectedItems(), event);
			return true;
		}
		this.extendedSelection.select(this.chooser.selectedItem, this.chooser.values.length, {
			toggle: true,
			range: event.shiftKey,
		});
		this.setSelectedIndex(this.chooser.selectedItem, false);
		return true;
	}

	/**
	 * プレビューのキー。モーダルと常設のビューで同じ判定にし、フォーカスは入力欄に残す。
	 * 右矢印は入力欄の末尾にカーソルがあるときだけ使い、途中の編集を奪わない。
	 */
	private handlePreviewKey(event: KeyboardEvent): boolean {
		const { onPreview } = this.props;
		const hotkey = this.hotkeys.preview;
		if (!onPreview || !matchesHotkey(event, hotkey)) return false;
		const cursorIsAtEnd =
			this.inputEl.selectionStart === this.inputEl.value.length &&
			this.inputEl.selectionEnd === this.inputEl.value.length;
		const usesCursorKey = hotkey?.key === "ArrowRight" && hotkey.modifiers.length === 0;
		if (usesCursorKey && !this.inputEl.readOnly && !cursorIsAtEnd) return false;
		event.preventDefault();
		event.stopImmediatePropagation();
		const item = this.getSelectedItem();
		if (item === undefined || event.repeat || this.previewPending) return true;
		void this.previewItem(item);
		return true;
	}

	private async previewItem(item: T): Promise<void> {
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
			await this.props.onPreview?.(item);
		} catch (error) {
			logger.error("Failed to preview selection", error);
			new Notice(error instanceof Error ? error.message : t("modal.error.previewFailed"));
		} finally {
			this.previewPending = false;
			restoreFocus();
			window.setTimeout(restoreFocus, 0);
		}
	}

	private handleInputKeyDown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (this.handlePreviewKey(event)) return;
		if (this.handleModeCommand(event)) return;
		if (this.props.onContextMenu && matchesHotkey(event, this.hotkeys.contextMenu)) {
			event.preventDefault();
			event.stopPropagation();
			if (!event.repeat) this.showActiveRowContextMenu();
			return;
		}
		if (event.key === "Escape") {
			event.preventDefault();
			event.stopPropagation();
			this.props.onEscape?.();
			return;
		}
		if (matchesHotkey(event, this.hotkeys.enterMode)) {
			const item = this.getSelectedItem();
			if (item !== undefined && this.props.onTab?.(item)) {
				event.preventDefault();
				event.stopPropagation();
				return;
			}
		}
		if (
			event.key === "Backspace" &&
			this.inputEl.value === "" &&
			!event.repeat &&
			this.props.onEmptyBackspace?.()
		) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			event.stopPropagation();
			if (!this.chooser.values.length) return;
			// 入力欄にフォーカスが残っている間も、キーボードの選択は結果の一覧を使う。
			// 結果のポインター操作と同じく、その操作を記録する。
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
		// Component のアンロードは、すべてのリスナーを外す。そのため、同じモーダルを開き直すたびに、
		// ここで登録し直す必要がある。
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
				// 結果のクリックは、ユーザーの注意を入力からの一覧へ移す、具体的なブラウザーのイベント。
				// モーダルの一覧の余白のクリックも、昔から検索語を確定してきた。ビューにはテーブルの
				// ヘッダーもあるので、実際の結果の行だけを確定する。
				const modal = this.props.surface !== "view";
				if (modal) this.focusResults();
				const row = this.suggestionRowAtEvent(event);
				if (!row) {
					this.restoreFocusFromListSpace(event);
					return;
				}
				// 並べ替えのヘッダーも結果のコンテナを共有する。しかし、検索を利用履歴に記録するのは、
				// 実際の結果とのやり取りだけにする。
				if (!modal) this.focusResults();
				const item = this.itemAtRow(row);
				if (item === undefined) return;
				// Why: 中クリックの保護は click/auxclick までの間保ち、次の押下でリセットする。
				// 1回のジェスチャーで同じノートを2回開かないようにするため。
				this.middleClickRows.delete(row);
				const index = Number(row.getAttribute("data-index"));
				if (event.button === 0 && this.isRowToggleEvent(event)) {
					// Why: チェックの操作は、その行で即座に動く。押下をそのまま通すと、強調表示の選択も変わる。
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.props.onRowToggle?.(item, event);
				} else if (
					event.button === 0 &&
					this.props.activateOnClick?.(item) &&
					!event.ctrlKey &&
					!event.metaKey &&
					!event.shiftKey
				) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.setSelectedIndex(index, false);
					void this.props.onChoose(item, event);
				} else if (event.button === 0 && this.selectionMode === "extended") {
					// Why: サイドバーは、mousedown の後に Obsidian にクリックを奪われることがある。
					// 今ここで選び、開く操作はダブルクリックと Enter だけに任せる。
					event.preventDefault();
					event.stopImmediatePropagation();
					this.leftClickRows.add(row);
					this.extendedSelection.select(index, this.chooser.values.length, {
						toggle: event.ctrlKey || event.metaKey,
						range: event.shiftKey,
					});
					this.setSelectedIndex(index, false);
				} else if (event.button === 0 && this.props.surface === "view") {
					// サイドバーのクリックは、mousedown の後に Obsidian に消費されることがある。そのため、
					// 主な操作はここで実行し、後のクリックはガードを外すだけにする。
					// 単一選択のモーダルは、通常のクリックでの有効化を保つ。
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
				// チェックの上で素早く2回押すと、すでに2回切り替わっている。その後に続く dblclick で、
				// さらに行を有効にしてはいけない。
				if (this.isRowToggleEvent(event)) {
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				const row = this.suggestionRowAtEvent(event);
				const item = row ? this.itemAtRow(row) : undefined;
				if (!row || item === undefined) return;
				if (this.props.activateOnClick?.(item)) return;
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
				// Why: 補助の右クリックは、ホストが先行する mousedown を届けなかったとしても、
				// 決して中クリックの操作を使ってはいけない。
				if (event.button === 1) this.handleMiddleClick(row, event);
			},
			true,
		);
		this.registerDomEvent(
			this.resultContainerEl,
			"click",
			(event) => {
				// 中・右クリックの後に発火する click/auxclick の取りこぼしが、主な操作として onChoose へ
				// 落ちて、アクティブなタブを上書きしないよう、左クリック以外はここで確実に消費する。
				// Why: Electron/Windows の環境では、中クリックで click が、右クリックで click が飛ぶことがあり、
				// ガードの漏れが上書きの原因になっていた。
				if (event.button !== 0) {
					event.preventDefault();
					event.stopImmediatePropagation();
					// Why: 一部の Electron のホストは、中ボタンに auxclick の代わりに click を出す。
					// 通常の mousedown の経路とガードを共有する。
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
				this.showRowContextMenu(Number(row.getAttribute("data-index")), item, event);
			},
			true,
		);
	}

	private showRowContextMenu(index: number, item: T, event: MouseEvent): void {
		if (this.selectionMode === "extended")
			this.extendedSelection.selectForContextMenu(index, this.chooser.values.length);
		this.setSelectedIndex(index, false);
		this.props.onContextMenu?.(item, event, this.getSelectedItems());
	}

	/** コンテキストメニューのホットキーと同じく、アクティブな行の下にその行のメニューを開く。 */
	showActiveRowContextMenu(): void {
		const index = this.chooser.selectedItem;
		const item = this.getSelectedItem();
		const row = this.resultContainerEl.querySelector<HTMLElement>(
			`.suggestion-item[data-index="${index}"]`,
		);
		if (item === undefined || !row) return;
		row.scrollIntoView({ block: "nearest" });
		const rect = row.getBoundingClientRect();
		// Why: メニューのホストはマウスのイベントから位置を決めるので、キーボードの経路は、
		// アクティブな行のすぐ下に、ドロップダウンのように合成したイベントを置く。
		const event = markKeyboardMenuEvent(
			new MouseEvent("contextmenu", {
				clientX: rect.left,
				clientY: rect.bottom,
				view: row.win,
			}),
		);
		this.showRowContextMenu(index, item, event);
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
		// Why: 復元されたポップアウトのパネルは別の窓にノードを作る。その Element のコンストラクタは
		// プラグインの窓のものと違う。Obsidian は窓をまたいで確認する。
		if (!target?.instanceOf(Element)) return undefined;
		const row = target.closest(".suggestion-item");
		return row && this.resultContainerEl.contains(row) ? row : undefined;
	}

	private itemAtRow(row: Element): T | undefined {
		const index = Number(row.getAttribute("data-index"));
		return Number.isInteger(index) && index >= 0 ? this.chooser.values[index] : undefined;
	}

	/** カーソルの行の番号。一覧が空なら -1。 */
	get activeIndex(): number {
		return this.chooser.selectedItem;
	}

	/**
	 * 描き直しの後に、選択とカーソルを戻す。描き直すと選択が先頭の行に戻るので、行は新しい一覧の
	 * 番号で与える。
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
