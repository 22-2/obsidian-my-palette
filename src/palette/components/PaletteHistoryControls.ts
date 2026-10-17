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
>;

interface PaletteHistoryControlsOptions {
	plugin: PaletteControlsPlugin;
	surface: PaletteSurface;
	/** The categories "Clear search history" removes: the palette's own, or a selector's single one. */
	historyCategories: readonly SearchHistoryCategory[];
	inputEl: HTMLInputElement;
	containerEl: HTMLElement;
	hostEl: HTMLElement;
	getContext: (input: string) => PaletteHistoryContext;
	apply: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
	/** Only modal hosts can move their current search into a sidebar pane. */
	moveToSidebar?: () => void;
	/** Selector hosts supply only actions that apply to their own candidates. */
	populateActions?: (menu: PaletteMenu, event: MouseEvent) => void;
	showHelp?: () => void;
	focusInput?: () => void;
	/** The host's footer switches, read each time the menu opens, so the menu can flip them too. */
	getSwitches?: () => readonly PanelSwitch[];
	/** Pick-one options listed above the switches, each under its own heading. */
	getChoices?: () => readonly MenuChoice[];
	/**
	 * Whether the menu offers "Highlight search matches"; on by default. Palettes turn it off:
	 * the preference is for the selectors, whose menu is the only place it is changed.
	 */
	showHighlightOption?: boolean;
}

/** Shared search-history and options controls for both palette surfaces. */
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
		// Why: sidebar surfaces can be rebuilt without unloading the plugin, so
		// listeners owned by an old surface must be released at the same time.
		this.eventController.abort();
		this.activeMenu?.close();
		this.unsubscribeDisplay();
		this.options.hostEl.removeClass("my-palette-highlight-disabled");
		this.suggest.destroy();
		for (const button of this.buttons) button.remove();
	}

	close(): void {
		// Result presses stop propagation, so hosts explicitly dismiss both overlays.
		this.activeMenu?.close();
		this.suggest.close();
	}

	update(input = this.options.inputEl.value): void {
		this.updateHotkeyHint();
		if (!this.suggest.isOpen) return;
		const context = this.options.getContext(input);
		// Why: the search history list is a separate browsing surface; typing a new
		// search must not hide or reorder the saved entries shown in that list.
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
			attr: { type: "button", title: "Palette options" },
		});
		this.optionsButton = optionsButton;
		// Why: the menu leads with options (switches and choices); the screen's actions follow.
		setIcon(optionsButton, ICONS.options);
		// Why: the open menu may already be dismissed by the press itself before the
		// click arrives, so its state is read at pointerdown, which fires first.
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
				"aria-label": "Search history",
			},
		});
		this.historyButton = historyButton;
		this.updateHotkeyHint();
		// Why: a clock identifies saved searches without suggesting a generic dropdown.
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
				? `Palette options (${formatHotkey(hotkeys.optionsMenu)})`
				: "Palette options",
		);
		const hotkey = hotkeys.history;
		if (!this.historyButton) return;
		// Why: Obsidian shows aria-label as the tooltip, so a title as well would show two.
		this.historyButton.setAttribute(
			"aria-label",
			hotkey ? `Search history (${formatHotkey(hotkey)})` : "Search history",
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
	 * Opens the options menu just under its button, the same place every time, with its first
	 * action selected so Enter works at once. Pressing the key again closes it.
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
		// Why: a choice changes what the palette lists, so it leads the menu. Choosing an item
		// closes the menu, because the list behind it changes.
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
		// Why: the switches come first so they can be flipped with Enter, without remembering
		// each one's shortcut. Each stays open so several can be flipped in a row.
		const switches = (this.options.getSwitches?.() ?? []).filter(({ isHidden }) => !isHidden);
		const offersHighlight = this.options.showHighlightOption !== false;
		// Why: a heading with nothing under it would only be noise.
		if (switches.length > 0 || offersHighlight) menu.addHeading("Options");
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
		// Why: each kind of item gets its own group, so options, this screen's actions,
		// help and the destructive clear never read as one list.
		menu.addSeparator();
		// Why: the shared controls also serve persistent views, which already
		// live in the workspace and must not offer the modal's move action.
		if (moveToSidebar)
			menu.addItem((item) =>
				withAction(item, MENU_ACTIONS.moveToRightSidebar).onClick(moveToSidebar),
			);
		this.options.populateActions?.(menu, event);
		menu.addSeparator();
		menu.addItem((item) => withAction(item, MENU_ACTIONS.help).onClick(() => this.showHelp()));
		menu.addSeparator();
		// Why: the destructive clear comes last, so it is not the first thing a press reaches.
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

	/** Clears only this screen's categories, on a second press. */
	private addClearHistoryItem(menu: PaletteMenu): void {
		const { plugin, historyCategories } = this.options;
		menu.addConfirmedItem({
			title: "Clear search history",
			confirmTitle: "Click again to clear",
			icon: ICONS.delete,
			run: () => {
				plugin.clearSearchHistoryCategories(historyCategories);
				new Notice("Search history cleared.");
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
		// Composition keys belong to the IME, including Enter used to confirm text.
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
