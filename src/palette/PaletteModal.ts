import { Menu, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { EverythingScope, PaletteMode, PaletteResult } from "src/palette/results";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { executePaletteResult } from "src/palette/executePaletteResult";
import type { ActionKind } from "src/palette/resultActions";
import { PaletteSearchSession, palettePlaceholder } from "src/palette/PaletteSearchSession";
import { toPaletteSelectionItem } from "src/palette/resultPresentation";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";
import { PaletteHistoryControls } from "src/palette/components/PaletteHistoryControls";

export class PaletteModal extends SelectionModal<PaletteResult> {
	private readonly session: PaletteSearchSession;
	private suppressHistoryForNextInput = false;
	private activeMenu?: Menu;
	private historyControls?: PaletteHistoryControls;
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
				selectionMode: "extended",
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
		this.historyControls = new PaletteHistoryControls({
			plugin: this.plugin,
			surface: "palette",
			inputEl: this.inputEl,
			containerEl: this.inputEl.parentElement ?? this.modalEl,
			hostEl: this.modalEl,
			getContext: (input) => this.session.getSearchHistoryContext(input),
			apply: (result) => this.applySearchHistory(result),
		});
		this.registerSelectionDomEvent(
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
		this.historyControls?.destroy();
		this.historyControls = undefined;
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

	protected override onSuggestionContextMenu(result: PaletteResult, event: MouseEvent): void {
		this.selected = result;
		const menu = this.replaceActiveMenu(new Menu());
		populatePaletteResultMenu({
			app: this.app,
			plugin: this.plugin,
			menu,
			result,
			selectedItems: this.getSelectedItems(),
			activate: (action, selected) => this.activatePaletteResult(action, selected),
			openInBackground: (selected) => this.openResultInBackground(selected),
			applySearchHistory: (history) => this.applySearchHistory(history),
			onNoteActionSelected: () => this.close(),
		});
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
			autoFocus: closePalette,
			close: () => this.close(),
			showError: (message) => {
				this.emptyStateText = message;
			},
		});
	}

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		this.historyControls?.close();
		this.suppressHistoryForNextInput = true;
		this.inputEl.value = this.plugin.formatSearchHistoryInput(result);
		this.refreshSuggestions();
		this.inputEl.focus({ preventScroll: true });
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
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

	private async openSelectedWithoutClosing(): Promise<void> {
		// The shared panel owns selection; preview the same item as Enter/double-click.
		const result = this.getSelectedItem();
		if (!result || result.mode === "command") return;
		// Right Arrow opens the selected result without moving focus to the list,
		// so it must commit the query before this keyboard-only action runs.
		this.session.commitCurrentSearch();
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
