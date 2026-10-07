import { Menu, setIcon } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import type { SearchHistoryCategory } from "src/settings/model";
import { PaletteHelpModal } from "src/ui/paletteHelpModal";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";

interface PaletteHistoryContext {
	query: string;
	category: SearchHistoryCategory;
	includeIgnored: boolean;
}

interface PaletteHistoryControlsOptions {
	plugin: MyPalettePlugin;
	inputEl: HTMLInputElement;
	containerEl: HTMLElement;
	hostEl: HTMLElement;
	getContext: (input: string) => PaletteHistoryContext;
	apply: (result: Extract<PaletteResult, { mode: "search-history" }>) => void;
}

/** Shared search-history and options controls for both palette surfaces. */
export class PaletteHistoryControls {
	private static readonly instances = new Set<PaletteHistoryControls>();
	private readonly suggest: SearchHistorySuggest;
	private readonly eventController = new AbortController();
	private activeMenu?: Menu;

	constructor(private readonly options: PaletteHistoryControlsOptions) {
		this.suggest = new SearchHistorySuggest(options.containerEl, options.apply);
		PaletteHistoryControls.instances.add(this);
		this.updateHighlight();
		this.addButtons();
		this.registerEvents();
	}

	destroy(): void {
		// Why: sidebar surfaces can be rebuilt without unloading the plugin, so
		// listeners owned by an old surface must be released at the same time.
		this.eventController.abort();
		this.activeMenu?.close();
		PaletteHistoryControls.instances.delete(this);
		this.options.hostEl.removeClass("my-palette-highlight-disabled");
		this.suggest.destroy();
	}

	close(): void {
		this.suggest.close();
	}

	update(input = this.options.inputEl.value): void {
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
		const historyButton = containerEl.createEl("button", {
			cls: "clickable-icon my-palette-history-button",
			attr: {
				type: "button",
				"aria-label": "Search history",
				"aria-keyshortcuts": "Control+R",
				title: "Search history (Ctrl+R)",
			},
		});
		setIcon(historyButton, "chevron-down");
		this.listen(historyButton, "mousedown", consumePointerEvent);
		this.listen(historyButton, "click", (event) => {
			consumePointerEvent(event);
			this.toggle();
		});

		const optionsButton = containerEl.createEl("button", {
			cls: "clickable-icon my-palette-options-button",
			attr: { type: "button", title: "Palette options" },
		});
		setIcon(optionsButton, "settings");
		this.listen(optionsButton, "mousedown", consumePointerEvent);
		this.listen(optionsButton, "click", (event) => {
			consumePointerEvent(event);
			this.showOptionsMenu(event);
		});
	}

	private updateHighlight(): void {
		this.options.hostEl.toggleClass(
			"my-palette-highlight-disabled",
			!this.options.plugin.settings.highlightSearchMatches,
		);
	}

	private showOptionsMenu(event: MouseEvent): void {
		const { plugin, hostEl } = this.options;
		this.close();
		this.activeMenu?.close();
		const menu = new Menu();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		menu.addItem((item) =>
			item
				.setTitle("Help")
				.setIcon("help-circle")
				.onClick(() => {
					new PaletteHelpModal(plugin.app, plugin.settings.prefixes).open();
				}),
		);
		menu.addItem((item) =>
			item
				.setTitle("Highlight search matches")
				.setIcon("highlighter")
				.setChecked(plugin.settings.highlightSearchMatches)
				.onClick(async () => {
					plugin.settings.highlightSearchMatches =
						!plugin.settings.highlightSearchMatches;
					// Why: update every open surface without rerunning searches or resetting selection.
					for (const controls of PaletteHistoryControls.instances) {
						if (controls.options.plugin === plugin) controls.updateHighlight();
					}
					await plugin.saveSettings();
				}),
		);
		menu.setParentElement(hostEl);
		menu.showAtMouseEvent(event);
	}

	private registerEvents(): void {
		const { inputEl, hostEl } = this.options;
		this.listen(inputEl, "input", () => this.update());
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
		if (
			event.ctrlKey &&
			!event.shiftKey &&
			!event.altKey &&
			!event.metaKey &&
			event.key.toLocaleLowerCase() === "r"
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
		const { inputEl, plugin } = this.options;
		const context = this.options.getContext(inputEl.value);
		this.suggest.show(
			plugin.getSearchHistorySuggestions("", context.category, context.includeIgnored),
		);
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
