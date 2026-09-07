import { Menu, setIcon, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { EverythingScope, PaletteMode, PaletteResult } from "src/model/results";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { executePaletteResult } from "src/palette/executePaletteResult";
import type { ActionKind } from "src/palette/resultActions";
import {
	PaletteSearchSession,
	palettePlaceholder,
	type RecordableSearch,
} from "src/palette/PaletteSearchSession";
import { getCopyablePaths, toPaletteSelectionItem } from "src/palette/resultPresentation";
import { addCopyPathMenuItems, copyPathToClipboard } from "src/platform/pathClipboard";
import { addMocInsertionMenuItem } from "src/palette/mocInsertion";
import { PaletteHelpModal } from "src/ui/paletteHelpModal";

export class PaletteModal extends SelectionModal<PaletteResult> {
	private readonly session: PaletteSearchSession;
	private suppressHistoryForNextInput = false;
	private activeMenu?: Menu;
	private historySuggest?: SearchHistorySuggest;
	private mode: PaletteMode = "file";
	private everythingScope: EverythingScope = "vault";

	constructor(
		app: App,
		private readonly plugin: MyPalettePlugin,
		initialInput = "",
		private readonly fixedMode?: Extract<
			PaletteMode,
			"link" | "backlink" | "bookmark" | "smart"
		>,
	) {
		super(
			{
				title: "Files",
				placeholder: "Search files",
				initialInput,
				footerText: `Source: ${app.workspace.getActiveFile()?.path ?? "No active note"}`,
			},
			app,
		);
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode,
			onStateChange: (state) => {
				this.mode = state.mode;
				this.everythingScope = state.everythingScope;
				this.updateMatchQuery(state.query);
				this.updateMode();
				this.updateResultCount(state.resultCount);
				if (state.error) this.emptyStateText = state.error;
			},
		});
	}

	protected override onSelectionModalOpen(): void {
		// SelectionModal applies and refreshes the initial input.
		this.addSearchHistoryButton();
		this.addHelpButton();
		this.historySuggest = new SearchHistorySuggest(
			this.inputEl.parentElement ?? this.modalEl,
			(result) => this.applySearchHistory(result),
		);
		this.plugin.registerDomEvent(this.inputEl, "input", () => {
			const history = this.getSearchHistoryContext(this.inputEl.value);
			this.historySuggest?.update(
				this.plugin.getSearchHistorySuggestions(
					history.query,
					history.category,
					history.includeIgnored,
				),
			);
		});
		this.plugin.registerDomEvent(
			this.inputEl,
			"keydown",
			(event) => {
				if (
					event.ctrlKey &&
					!event.shiftKey &&
					!event.altKey &&
					!event.metaKey &&
					event.key.toLocaleLowerCase() === "r"
				) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.showSearchHistorySuggest();
					return;
				}
				if (!this.historySuggest?.isOpen) return;
				if (event.key === "ArrowDown" || event.key === "ArrowUp") {
					if (!this.historySuggest.moveSelection(event.key === "ArrowDown" ? 1 : -1))
						return;
					event.preventDefault();
					event.stopImmediatePropagation();
					return;
				}
				if (event.key !== "Enter" || !this.historySuggest.selectCurrent()) return;
				event.preventDefault();
				event.stopImmediatePropagation();
			},
			true,
		);
		this.plugin.registerDomEvent(
			window,
			"keydown",
			(event) => {
				if (
					event.key !== "Escape" ||
					this.historySuggest?.isOpen !== true ||
					!(event.target instanceof Node) ||
					!this.modalEl.contains(event.target)
				)
					return;
				event.preventDefault();
				event.stopImmediatePropagation();
				this.historySuggest.close();
			},
			true,
		);
		this.plugin.registerDomEvent(document, "mousedown", (event) => {
			const target = event.target;
			if (
				!(target instanceof Node) ||
				this.historySuggest?.isOpen !== true ||
				this.historySuggest?.contains(target) ||
				target === this.inputEl ||
				(target instanceof Element && target.closest(".my-palette-history-button"))
			)
				return;
			this.historySuggest.close();
		});
		this.plugin.registerDomEvent(
			this.inputEl,
			"keydown",
			(event) => {
				const cursorIsAtEnd =
					this.inputEl.selectionStart === this.inputEl.value.length &&
					this.inputEl.selectionEnd === this.inputEl.value.length;
				if (event.key !== "ArrowRight" || event.isComposing || !cursorIsAtEnd) return;
				event.preventDefault();
				event.stopImmediatePropagation();
				void this.openSelectedWithoutClosing();
			},
			true,
		);
	}

	protected override onSelectionModalClose(): void {
		this.plugin.releasePaletteModal(this);
		// This session owns the request signal; canceling the shared client here
		// would also interrupt searches in still-open sidebar views.
		this.session.dispose();
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historySuggest?.destroy();
		this.historySuggest = undefined;
	}

	protected override getInitialInputSelectionRange(): [number, number] {
		const commandPrefix = `${this.plugin.settings.prefixes.command.trimEnd()} `;
		return this.inputEl.value.toLocaleLowerCase().startsWith(commandPrefix.toLocaleLowerCase())
			? [commandPrefix.length, this.inputEl.value.length]
			: [0, this.inputEl.value.length];
	}

	protected override toSelectionItem(result: PaletteResult): SelectionItem {
		return toPaletteSelectionItem(this.app, result, {
			openExternalMarkdownInObsidian: this.plugin.settings.openExternalMarkdownInObsidian,
		});
	}

	protected override async onItemActivated(result: PaletteResult, _event: Event): Promise<void> {
		await this.activatePaletteResult("primary", result);
	}

	protected override onResultFocus(): void {
		this.session.commitCurrentSearch();
	}

	protected override async onSuggestionMiddleClick(result: PaletteResult): Promise<void> {
		if (result.mode === "search-history") {
			this.applySearchHistory(result);
			return;
		}
		const activeLeaf = this.app.workspace.activeLeaf;
		try {
			await this.openResultInBackground(result);
		} finally {
			if (activeLeaf && this.app.workspace.activeLeaf !== activeLeaf)
				this.app.workspace.setActiveLeaf(activeLeaf, { focus: false });
			this.inputEl.focus({ preventScroll: true });
		}
	}

	protected override handlesSuggestionMiddleClick(): boolean {
		return true;
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override registerSelectionDomEvent<K extends keyof HTMLElementEventMap>(
		el: HTMLElement,
		type: K,
		callback: (this: HTMLElement, ev: HTMLElementEventMap[K]) => any,
		options?: boolean | AddEventListenerOptions,
	): void {
		this.plugin.registerDomEvent(el, type, callback, options);
	}

	protected override onSuggestionContextMenu(result: PaletteResult, event: MouseEvent): void {
		this.selected = result;
		const menu = this.replaceActiveMenu(new Menu());
		if (result.mode === "search-history") {
			menu.addItem((item) =>
				item
					.setTitle("Use search")
					.setIcon("history")
					.onClick(() => this.applySearchHistory(result)),
			);
		} else if (result.mode === "command") {
			menu.addItem((item) =>
				item
					.setTitle("Run command")
					.setIcon("play")
					.onClick(() => void this.activatePaletteResult("primary", result)),
			);
		} else {
			const paths = getCopyablePaths(this.app, result);
			menu.addItem((item) =>
				item
					.setTitle("Open")
					.setIcon("external-link")
					.onClick(() => void this.activatePaletteResult("primary", result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in new tab (background)")
					.setIcon("panel-top-open")
					.onClick(() => void this.openResultInBackground(result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open side by side")
					.setIcon("separator-vertical")
					.onClick(() => void this.activatePaletteResult("vertical", result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open below")
					.setIcon("separator-horizontal")
					.onClick(() => void this.activatePaletteResult("horizontal", result)),
			);
			if (result.mode === "everything") {
				menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle("Show in file explorer")
						.setIcon("folder-open")
						.onClick(() => void this.activatePaletteResult("alternate", result)),
				);
			}
			addCopyPathMenuItems(menu, paths, (path) => void copyPathToClipboard(path));
			// MOC insertion is intentionally last: it is a multi-note mutation,
			// unlike the immediately discoverable open and copy actions above.
			addMocInsertionMenuItem(menu, this.plugin, result, () => this.close());
		}
		menu.setParentElement(this.modalEl);
		menu.showAtMouseEvent(event);
	}

	override async getSuggestions(input: string): Promise<PaletteResult[]> {
		const suppressHistoryRecord = this.suppressHistoryForNextInput;
		this.suppressHistoryForNextInput = false;
		return await this.session.search(input, { suppressHistory: suppressHistoryRecord });
	}

	private updateMode(): void {
		this.updatePlaceholder(palettePlaceholder(this.mode));
		this.modalEl.setAttribute("data-mode", this.mode);
		this.modalEl.setAttribute("data-everything-scope", this.everythingScope);
	}

	private async activatePaletteResult(
		action: ActionKind,
		result: PaletteResult,
		closePalette = true,
	): Promise<void> {
		if (!result) return;
		if (result.mode === "search-history") {
			this.applySearchHistory(result);
			return;
		}
		await executePaletteResult(this.plugin, result, action, {
			closeWhenDone: closePalette,
			active: true,
			externalAutoFocus: closePalette,
			close: () => this.close(),
			showError: (message) => {
				this.emptyStateText = message;
			},
		});
	}

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		this.historySuggest?.close();
		this.suppressHistoryForNextInput = true;
		this.inputEl.value = this.plugin.formatSearchHistoryInput(result);
		this.refreshSuggestions();
		this.inputEl.focus({ preventScroll: true });
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
	}

	private addSearchHistoryButton(): void {
		const container = this.inputEl.parentElement;
		if (!container) return;
		const button = container.createEl("button", {
			cls: "clickable-icon my-palette-history-button",
			attr: {
				type: "button",
				"aria-label": "Search history",
				"aria-keyshortcuts": "Control+R",
				title: "Search history (Ctrl+R)",
			},
		});
		setIcon(button, "chevron-down");
		this.plugin.registerDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.plugin.registerDomEvent(button, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.toggleSearchHistorySuggest();
		});
	}

	private addHelpButton(): void {
		const container = this.inputEl.parentElement;
		if (!container) return;
		const button = container.createEl("button", {
			cls: "clickable-icon my-palette-help-button",
			attr: { type: "button", "aria-label": "Palette help", title: "Palette help" },
		});
		setIcon(button, "help-circle");
		this.plugin.registerDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.plugin.registerDomEvent(button, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			new PaletteHelpModal(this.app, this.plugin.settings.prefixes).open();
		});
	}

	private showSearchHistorySuggest(): void {
		const history = this.getSearchHistoryContext(this.inputEl.value);
		this.historySuggest?.show(
			this.plugin.getSearchHistorySuggestions(
				history.query,
				history.category,
				history.includeIgnored,
			),
		);
		this.inputEl.focus({ preventScroll: true });
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
	}

	private toggleSearchHistorySuggest(): void {
		if (this.historySuggest?.isOpen) {
			this.historySuggest.close();
			return;
		}
		this.showSearchHistorySuggest();
	}

	private replaceActiveMenu(menu: Menu): Menu {
		this.activeMenu?.close();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		return menu;
	}

	private async openResultInBackground(result: PaletteResult): Promise<void> {
		// Background opening does not close the palette, so retain its successful
		// action behavior for callers that did not click the result list.
		await openPaletteResultInBackground(this.plugin, result);
	}

	private getSearchHistoryContext(input: string): {
		query: string;
		category: RecordableSearch["category"];
		includeIgnored: boolean;
	} {
		return this.session.getSearchHistoryContext(input);
	}

	private async openSelectedWithoutClosing(): Promise<void> {
		const chooser = this as unknown as {
			chooser?: { values?: PaletteResult[]; selectedItem?: number };
		};
		const result = chooser.chooser?.values?.[chooser.chooser.selectedItem ?? -1];
		if (!result || result.mode === "command") return;
		const selectionStart = this.inputEl.selectionStart;
		const selectionEnd = this.inputEl.selectionEnd;
		await this.activatePaletteResult("primary", result, false);
		window.setTimeout(() => {
			if (!this.inputEl.isConnected) return;
			this.inputEl.focus({ preventScroll: true });
			this.inputEl.setSelectionRange(selectionStart, selectionEnd);
		});
	}
}
