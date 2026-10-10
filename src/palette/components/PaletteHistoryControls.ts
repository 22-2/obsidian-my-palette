import { Menu, setIcon } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import type { PaletteSurface, SearchHistoryCategory } from "src/settings/model";
import { PaletteHelpModal } from "src/ui/paletteHelpModal";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";
import { DEFAULT_HOTKEYS, formatHotkey, matchesHotkey } from "src/ui/hotkeys";

interface PaletteHistoryContext {
	query: string;
	category: SearchHistoryCategory;
	includeIgnored: boolean;
}

export type PaletteControlsPlugin = Pick<
	MyPalettePlugin,
	"app" | "settings" | "paletteDisplaySettings" | "getSearchHistorySuggestions"
>;

interface PaletteHistoryControlsOptions {
	plugin: PaletteControlsPlugin;
	surface: PaletteSurface;
	inputEl: HTMLInputElement;
	containerEl: HTMLElement;
	hostEl: HTMLElement;
	getContext: (input: string) => PaletteHistoryContext;
	apply: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
	/** Only modal hosts can move their current search into a sidebar pane. */
	moveToSidebar?: () => void;
	/** Selector hosts supply only actions that apply to their own candidates. */
	populateActions?: (menu: Menu, event: MouseEvent) => void;
	showHelp?: () => void;
	focusInput?: () => void;
}

/** Shared search-history and options controls for both palette surfaces. */
export class PaletteHistoryControls {
	private readonly unsubscribeDisplay: () => void;
	private readonly suggest: SearchHistorySuggest;
	private readonly eventController = new AbortController();
	private readonly buttons: HTMLElement[] = [];
	private activeMenu?: Menu;
	private historyButton?: HTMLButtonElement;

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
		// Why: the history picker is a separate browsing surface; typing a new
		// search must not hide or reorder the saved entries shown in that picker.
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
		// Why: this menu contains actions as well as preferences.
		setIcon(optionsButton, "ellipsis");
		this.listen(optionsButton, "mousedown", consumePointerEvent);
		this.listen(optionsButton, "click", (event) => {
			consumePointerEvent(event);
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
		setIcon(historyButton, "clock");
		this.buttons.push(optionsButton, historyButton);
		this.listen(historyButton, "mousedown", consumePointerEvent);
		this.listen(historyButton, "click", (event) => {
			consumePointerEvent(event);
			this.toggle();
		});
	}

	private updateHotkeyHint(): void {
		const hotkey = (this.options.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS).history;
		if (!this.historyButton) return;
		this.historyButton.title = hotkey
			? `Search history (${formatHotkey(hotkey)})`
			: "Search history";
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

	private showOptionsMenu(event: MouseEvent): void {
		const { plugin, hostEl, surface } = this.options;
		this.close();
		const menu = new Menu();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		// Why: disabled headings and a separator match the pane-menu pattern,
		// keeping one-off actions before persistent display preferences.
		menu.addItem((item) => item.setTitle("Actions").setIcon("zap").setDisabled(true));
		this.options.populateActions?.(menu, event);
		const { moveToSidebar } = this.options;
		if (moveToSidebar) {
			// Why: the shared controls also serve persistent views, which already
			// live in the workspace and must not offer the modal's move action.
			menu.addItem((item) =>
				item
					.setTitle("Move to right sidebar")
					.setIcon("panel-right")
					.onClick(moveToSidebar),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle("Help")
				.setIcon("help-circle")
				.onClick(() => {
					if (this.options.showHelp) this.options.showHelp();
					else
						new PaletteHelpModal(
							plugin.app,
							plugin.settings.prefixes,
							surface,
							plugin.settings.hotkeys,
						).open();
				}),
		);
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Options").setIcon("settings").setDisabled(true));
		menu.addItem((item) =>
			item
				.setTitle("Highlight search matches")
				.setIcon("highlighter")
				.setChecked(plugin.paletteDisplaySettings.get(surface).highlightSearchMatches)
				.onClick(() => plugin.paletteDisplaySettings.toggleHighlight(surface)),
		);
		menu.setParentElement(hostEl);
		menu.showAtMouseEvent(event);
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
				(target instanceof Element && target.closest(".my-palette-history-button"))
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
		if (
			matchesHotkey(event, (this.options.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS).history)
		) {
			event.preventDefault();
			event.stopImmediatePropagation();
			this.show();
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
