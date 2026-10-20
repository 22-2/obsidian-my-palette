import { Notice, setIcon } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { markKeyboardMenuEvent, showMenuAtEvent } from "src/ui/menus";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import type { PaletteSurface, SearchHistoryCategory } from "src/settings/model";
import { PaletteHelpModal } from "src/ui/paletteHelpModal";
import { availableModes } from "src/palette/modes";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";
import { DEFAULT_HOTKEYS, formatHotkey, matchesHotkey } from "src/ui/hotkeys";
import type { MenuChoice } from "src/ui/panelChoice";
import type { PanelSwitch } from "src/ui/panelSwitch";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

interface PaletteHistoryContext {
	query: string;
	category: SearchHistoryCategory;
	includeIgnored: boolean;
}

export type PaletteControlsPlugin = Pick<
	MyPalettePlugin,
	| "app"
	| "settings"
	| "integrationAvailability"
	| "paletteDisplaySettings"
	| "getSearchHistorySuggestions"
	| "clearSearchHistoryCategories"
	| "saveSettings"
>;

interface PaletteHistoryControlsOptions {
	plugin: PaletteControlsPlugin;
	surface: PaletteSurface;
	/** 「検索履歴を消去」が削除するカテゴリ。パレット自身のもの、またはセレクターの1つ。 */
	historyCategories: readonly SearchHistoryCategory[];
	inputEl: HTMLInputElement;
	containerEl: HTMLElement;
	hostEl: HTMLElement;
	getContext: (input: string) => PaletteHistoryContext;
	apply: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
	/** 現在の検索をサイドバーのペインへ移せるのは、モーダルのホストだけ。 */
	moveToSidebar?: () => void;
	/** セレクターのホストは、自分の候補に働く操作だけを渡す。 */
	populateActions?: (menu: PaletteMenu, event: MouseEvent) => void;
	showHelp?: () => void;
	focusInput?: () => void;
	/** ホストのフッターのスイッチ。メニューを開くたびに読み、メニューからも切り替えられるようにする。 */
	getSwitches?: () => readonly PanelSwitch[];
	/** スイッチの上に並べる、1つだけ選ぶオプション。それぞれ独自の見出しを持つ。 */
	getChoices?: () => readonly MenuChoice[];
	/**
	 * メニューに「検索の一致を強調」を出すかどうか。既定は on。パレットは off にする。
	 * この設定はセレクター向けで、変更できるのはそのメニューだけだから。
	 */
	showHighlightOption?: boolean;
	/** メニューにファイル検索の切り替えを出すかどうか。既定は出さない。パレット本体だけが出す。 */
	showFileSearchOptions?: boolean;
}

/** ファイル検索の設定を切り替える項目。切り替えを増やすときは、ここに1行足す。 */
const FILE_SEARCH_TOGGLES = [
	{ key: "foldKana", action: MENU_ACTIONS.foldKana },
	{ key: "openableFilesOnly", action: MENU_ACTIONS.openableFilesOnly },
] as const;

/** 両方のパレットの外枠で共有する、検索履歴とオプションの操作。 */
export class PaletteHistoryControls {
	private readonly unsubscribeDisplay: () => void;
	private readonly suggest: SearchHistorySuggest;
	private readonly eventController = new AbortController();
	private readonly buttons: HTMLElement[] = [];
	private activeMenu?: PaletteMenu;
	private historyButton?: HTMLButtonElement;
	private optionsButton?: HTMLButtonElement;

	constructor(private readonly options: PaletteHistoryControlsOptions) {
		this.suggest = new SearchHistorySuggest(options.containerEl, options.apply);
		this.unsubscribeDisplay = options.plugin.paletteDisplaySettings.subscribe(
			options.surface,
			({ highlightSearchMatches }) =>
				options.hostEl.toggleClass(
					"my-palette-highlight-disabled",
					!highlightSearchMatches,
				),
		);
		this.addButtons();
		this.registerEvents();
	}

	destroy(): void {
		// Why: サイドバーの外枠は、プラグインを解除せずに作り直されることがある。そのため、
		// 古い外枠が持つリスナーは同時に解放しなければならない。
		this.eventController.abort();
		this.activeMenu?.close();
		this.unsubscribeDisplay();
		this.options.hostEl.removeClass("my-palette-highlight-disabled");
		this.suggest.destroy();
		for (const button of this.buttons) button.remove();
	}

	close(): void {
		// 結果の押下はイベントの伝播を止めるので、ホストは両方のオーバーレイを明示的に閉じる。
		this.activeMenu?.close();
		this.suggest.close();
	}

	update(input = this.options.inputEl.value): void {
		this.updateHotkeyHint();
		if (!this.suggest.isOpen) return;
		const context = this.options.getContext(input);
		// Why: 検索履歴の一覧は独立した閲覧の画面である。新しい検索を打っても、
		// その一覧に出ている保存済みの項目を隠したり並べ替えたりしてはいけない。
		this.suggest.update(
			this.options.plugin.getSearchHistorySuggestions(
				"",
				context.category,
				context.includeIgnored,
			),
		);
	}

	private addButtons(): void {
		const { containerEl } = this.options;
		const optionsButton = containerEl.createEl("button", {
			cls: "clickable-icon my-palette-options-button",
			attr: { type: "button", title: t("palette.control.options") },
		});
		this.optionsButton = optionsButton;
		// Why: メニューは先頭にオプション(スイッチと選択肢)を置き、その画面の操作が続く。
		setIcon(optionsButton, ICONS.options);
		// Why: 開いているメニューは、クリックが届く前に押下そのもので閉じられてしまうことがある。
		// そのため、最初に起きる pointerdown で状態を読む。
		let menuWasOpen = false;
		this.listen(optionsButton, "pointerdown", () => {
			menuWasOpen = this.activeMenu !== undefined;
		});
		this.listen(optionsButton, "mousedown", consumePointerEvent);
		this.listen(optionsButton, "click", (event) => {
			consumePointerEvent(event);
			const shouldClose = menuWasOpen;
			menuWasOpen = false;
			if (shouldClose) {
				this.activeMenu?.close();
				return;
			}
			this.showOptionsMenu(event);
		});

		const historyButton = containerEl.createEl("button", {
			cls: "clickable-icon my-palette-history-button",
			attr: {
				type: "button",
				"aria-label": t("palette.control.history"),
			},
		});
		this.historyButton = historyButton;
		this.updateHotkeyHint();
		// Why: 時計のアイコンは、汎用のドロップダウンを連想させずに保存済みの検索を示す。
		setIcon(historyButton, ICONS.history);
		this.buttons.push(optionsButton, historyButton);
		this.listen(historyButton, "mousedown", consumePointerEvent);
		this.listen(historyButton, "click", (event) => {
			consumePointerEvent(event);
			this.toggle();
		});
	}

	private updateHotkeyHint(): void {
		const hotkeys = this.options.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS;
		this.optionsButton?.setAttribute(
			"title",
			hotkeys.optionsMenu
				? t("palette.control.optionsHotkey", { hotkey: formatHotkey(hotkeys.optionsMenu) })
				: t("palette.control.options"),
		);
		const hotkey = hotkeys.history;
		if (!this.historyButton) return;
		// Why: Obsidian は aria-label をツールチップとして出すので、title も付けると二重に出る。
		this.historyButton.setAttribute(
			"aria-label",
			hotkey
				? t("palette.control.historyHotkey", { hotkey: formatHotkey(hotkey) })
				: t("palette.control.history"),
		);
		if (!hotkey) {
			this.historyButton.removeAttribute("aria-keyshortcuts");
			return;
		}
		const names = { Ctrl: "Control", Alt: "Alt", Shift: "Shift", Meta: "Meta" };
		this.historyButton.setAttribute(
			"aria-keyshortcuts",
			[...hotkey.modifiers.map((modifier) => names[modifier]), hotkey.key].join("+"),
		);
	}

	/**
	 * オプションのメニューを、ボタンのすぐ下の、いつも同じ場所に開く。最初の操作が選ばれた状態になるので、
	 * Enter ですぐ動く。もう一度キーを押すと閉じる。
	 */
	private toggleOptionsMenuFromKeyboard(): void {
		if (this.activeMenu) {
			this.activeMenu.close();
			return;
		}
		const button = this.optionsButton;
		if (!button) return;
		const rect = button.getBoundingClientRect();
		this.showOptionsMenu(
			markKeyboardMenuEvent(
				new MouseEvent("click", { clientX: rect.left, clientY: rect.bottom }),
			),
		);
	}

	private showOptionsMenu(event: MouseEvent): void {
		const { plugin, hostEl, moveToSidebar } = this.options;
		this.close();
		const menu = new PaletteMenu();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		// Why: 選択肢はパレットに並ぶ一覧を変えるので、メニューの先頭に置く。項目を選ぶと、
		// 後ろの一覧が変わるのでメニューを閉じる。
		const choices = (this.options.getChoices?.() ?? []).filter(({ isHidden }) => !isHidden);
		for (const choice of choices) {
			menu.addHeading(choice.label);
			for (const option of choice.items)
				menu.addItem((item) =>
					item
						.setTitle(option.label)
						.setIcon(option.icon ?? null)
						.setChecked(option.value === choice.value)
						.onClick(() => choice.choose(option.value)),
				);
			menu.addSeparator();
		}
		// Why: スイッチは先に置く。Enter で、それぞれのショートカットを覚えなくても切り替えられるようにするため。
		// 各項目は開いたままにし、続けていくつも切り替えられるようにする。
		const switches = (this.options.getSwitches?.() ?? []).filter(({ isHidden }) => !isHidden);
		const offersHighlight = this.options.showHighlightOption !== false;
		const offersFileSearch = this.options.showFileSearchOptions === true;
		// Why: 中身のない見出しは、ただのノイズになる。
		if (switches.length > 0 || offersHighlight || offersFileSearch)
			menu.addHeading(t("palette.control.optionsHeading"));
		for (const toggle of switches) {
			menu.addItem((item) =>
				item
					.setTitle(toggle.label)
					.setIcon(toggle.icon ?? null)
					.setTooltip(toggle.description)
					.setSwitch(toggle.value)
					.setKeepOpen()
					.onClick(() => {
						toggle.flip();
						item.setSwitch(toggle.value);
					}),
			);
		}
		if (offersHighlight)
			menu.addItem((item) =>
				withAction(item, MENU_ACTIONS.highlightSearchMatches)
					.setSwitch(
						plugin.paletteDisplaySettings.get(this.options.surface)
							.highlightSearchMatches,
					)
					.setKeepOpen()
					.onClick(() => {
						void plugin.paletteDisplaySettings
							.toggleHighlight(this.options.surface)
							.then(() =>
								item.setSwitch(
									plugin.paletteDisplaySettings.get(this.options.surface)
										.highlightSearchMatches,
								),
							);
					}),
			);
		if (offersFileSearch)
			for (const { key, action } of FILE_SEARCH_TOGGLES)
				menu.addItem((item) =>
					withAction(item, action)
						.setSwitch(plugin.settings.file[key])
						.setKeepOpen()
						.onClick(() => {
							plugin.settings.file[key] = !plugin.settings.file[key];
							void plugin.saveSettings().then(() => {
								item.setSwitch(plugin.settings.file[key]);
								// Why: 入力し直したときと同じ経路で、結果を検索し直させる。
								this.options.inputEl.dispatchEvent(new Event("input"));
							});
						}),
				);
		// Why: 項目の種類ごとに独自のグループを持たせる。オプション、この画面の操作、ヘルプ、
		// 破壊的な消去が、1つの一覧に見えないようにするため。
		menu.addSeparator();
		// Why: 共有の操作は、すでにワークスペースにある常駐のビューでも使われる。そこでは、
		// モーダルの移動の操作を出してはいけない。
		if (moveToSidebar)
			menu.addItem((item) =>
				withAction(item, MENU_ACTIONS.moveToRightSidebar).onClick(moveToSidebar),
			);
		this.options.populateActions?.(menu, event);
		menu.addSeparator();
		menu.addItem((item) => withAction(item, MENU_ACTIONS.help).onClick(() => this.showHelp()));
		menu.addSeparator();
		// Why: 破壊的な消去は最後に置き、押した瞬間に最初に届かないようにする。
		this.addClearHistoryItem(menu);
		menu.setParentElement(hostEl);
		showMenuAtEvent(menu, event);
	}

	private showHelp(): void {
		const { plugin, surface, showHelp } = this.options;
		if (showHelp) showHelp();
		else
			new PaletteHelpModal(
				plugin.app,
				availableModes(plugin.settings, plugin.integrationAvailability.current),
				surface,
				plugin.settings.hotkeys,
			).open();
	}

	/** この画面のカテゴリだけを消去する。2回押しが必要。 */
	private addClearHistoryItem(menu: PaletteMenu): void {
		const { plugin, historyCategories } = this.options;
		menu.addConfirmedItem({
			title: t("palette.control.clearHistory"),
			confirmTitle: t("palette.control.confirmClear"),
			icon: ICONS.delete,
			run: () => {
				plugin.clearSearchHistoryCategories(historyCategories);
				new Notice(t("palette.notice.historyCleared"));
				this.update();
			},
		});
	}

	private registerEvents(): void {
		const { inputEl, hostEl } = this.options;
		this.listen(inputEl, "input", () => this.update());
		this.listen(inputEl, "focus", () => this.updateHotkeyHint());
		this.listen(inputEl, "keydown", (event) => this.handleKeyDown(event), true);
		this.listen(
			window,
			"keydown",
			(event) => {
				if (
					event.key !== "Escape" ||
					!this.suggest.isOpen ||
					!(event.target instanceof Node) ||
					!hostEl.contains(event.target)
				)
					return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.suggest.close();
			},
			true,
		);
		this.listen(document, "mousedown", (event) => {
			const target = event.target;
			if (
				!(target instanceof Node) ||
				!this.suggest.isOpen ||
				this.suggest.contains(target) ||
				target === inputEl ||
				(target.instanceOf(Element) && target.closest(".my-palette-history-button"))
			)
				return;
			this.suggest.close();
		});
	}

	private listen<K extends keyof WindowEventMap>(
		target: Window | Document | HTMLElement,
		type: K,
		listener: (event: WindowEventMap[K]) => void,
		capture = false,
	): void {
		target.addEventListener(type, listener as EventListener, {
			capture,
			signal: this.eventController.signal,
		});
	}

	private handleKeyDown(event: KeyboardEvent): void {
		// IME の変換中のキーは IME のもの。文字を確定するための Enter も含む。
		if (event.isComposing) return;
		const hotkeys = this.options.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS;
		if (matchesHotkey(event, hotkeys.history)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.show();
			return;
		}
		if (matchesHotkey(event, hotkeys.optionsMenu)) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.toggleOptionsMenuFromKeyboard();
			return;
		}
		if (!this.suggest.isOpen) return;
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			if (!this.suggest.moveSelection(event.key === "ArrowDown" ? 1 : -1)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			return;
		}
		if (event.key !== "Enter" || !this.suggest.selectCurrent()) return;
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	private show(): void {
		this.activeMenu?.close();
		const { inputEl, plugin } = this.options;
		const context = this.options.getContext(inputEl.value);
		this.suggest.show(
			plugin.getSearchHistorySuggestions("", context.category, context.includeIgnored),
		);
		this.options.focusInput?.();
		inputEl.focus({ preventScroll: true });
		inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
	}

	private toggle(): void {
		if (this.suggest.isOpen) {
			this.suggest.close();
			return;
		}
		this.show();
	}
}

function consumePointerEvent(event: MouseEvent): void {
	event.preventDefault();
	event.stopPropagation();
}
