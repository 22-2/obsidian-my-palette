import { Menu, type App } from "obsidian";
import { showMenuAtEvent } from "src/ui/menus";
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
import { ignoredToggleOptions, syncIgnoredToggle } from "src/palette/ignoredToggle";
import type { StatusToggle } from "src/ui/statusToggle";
import { getPaletteMode } from "src/palette/modes";
import type { PaletteSearchState } from "src/palette/PaletteSearchSession";

export interface PaletteModalOptions {
	/** Root Search lists mode entries above the files; off for the file-only palette. */
	modeEntries?: boolean;
}

export class PaletteModal extends SelectionModal<PaletteResult> {
	private readonly session: PaletteSearchSession;
	private suppressHistoryForNextInput = false;
	private activeMenu?: Menu;
	private historyControls?: PaletteHistoryControls;
	private ignoredToggle?: StatusToggle;
	private mode: PaletteMode = "file";
	private everythingScope: EverythingScope = "vault";
	private state?: PaletteSearchState;
	private readonly modeEntries: boolean;

	constructor(
		app: App,
		private readonly plugin: MyPalettePlugin,
		initialInput = "",
		private readonly fixedMode?: Extract<
			PaletteMode,
			"link" | "backlink" | "bookmark" | "smart" | "tab"
		>,
		{ modeEntries = false }: PaletteModalOptions = {},
	) {
		super(
			{
				title: "Files",
				getHotkeys: () => plugin.settings.hotkeys,
				placeholder: "Search files",
				initialInput,
				selectionMode: "extended",
				footerText: `Source: ${app.workspace.getActiveFile()?.path ?? "No active note"}`,
			},
			app,
		);
		this.modeEntries = modeEntries;
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode,
			navigation: { modeEntries },
			onStateChange: (state) => {
				this.state = state;
				// `alias + Space` moves into a mode and leaves only the query behind.
				if (this.inputEl.value !== state.input) this.panelInput(state.input);
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
			focusInput: () => this.focusSearchInput(),
			moveToSidebar: () => this.moveToSidebar(),
		});
		this.ignoredToggle = this.addStatusToggle(
			ignoredToggleOptions(this.session.current.ignoredScope, (value) => {
				this.session.setIgnoredScope(value);
				this.refreshSuggestions();
			}),
		);
		syncIgnoredToggle(this.ignoredToggle, this.mode);
	}

	protected override onSelectionModalClose(): void {
		this.plugin.paletteOpener.releaseModal(this);
		// This session owns the request signal; canceling the shared client here
		// would also interrupt searches in still-open sidebar views.
		this.session.dispose();
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historyControls?.destroy();
		this.historyControls = undefined;
		this.ignoredToggle = undefined;
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
		// Entering a mode is navigation; the alias typed to reach it is not a search.
		if (this.getSelectedItem()?.mode === "mode-entry") return;
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
			onTabsChanged: () => this.refreshSuggestions(),
		});
		menu.setParentElement(this.modalEl);
		showMenuAtEvent(menu, event);
	}

	override async getSuggestions(input: string): Promise<PaletteResult[]> {
		const suppressHistoryRecord = this.suppressHistoryForNextInput;
		this.suppressHistoryForNextInput = false;
		return await this.session.search(input, { suppressHistory: suppressHistoryRecord });
	}

	private updateMode(): void {
		const route = this.state?.route;
		this.modalEl.setAttribute("data-route", route?.kind ?? "root");
		if (route?.kind === "mode") {
			const definition = getPaletteMode(route.modeId);
			this.updatePlaceholder(definition.placeholder);
			this.setModeChip({
				icon: definition.icon,
				label: this.session.modeAlias ?? "",
				title: definition.title,
			});
		} else {
			this.updatePlaceholder(
				this.modeEntries ? "Search files, or pick a mode" : palettePlaceholder(this.mode),
			);
			this.setModeChip();
		}
		this.modalEl.setAttribute("data-mode", this.mode);
		this.modalEl.setAttribute("data-everything-scope", this.everythingScope);
		syncIgnoredToggle(this.ignoredToggle, this.mode);
	}

	protected override sectionOf(result: PaletteResult): string | undefined {
		if (!this.modeEntries || this.state?.route.kind !== "root") return undefined;
		// Headings only help when both kinds of rows share the list.
		if (!this.state.results.some((item) => item.mode === "mode-entry")) return undefined;
		return result.mode === "mode-entry" ? "Modes" : "Files";
	}

	protected override onSuggestionEscape(): void {
		if (this.state?.route.kind === "mode") this.returnToRoot();
		else this.close();
	}

	protected override onEmptyBackspace(): boolean {
		if (this.state?.route.kind !== "mode") return false;
		this.returnToRoot();
		return true;
	}

	protected override onModeChipClick(): void {
		this.returnToRoot();
	}

	private enterMode(result: Extract<PaletteResult, { mode: "mode-entry" }>): void {
		this.session.enterMode(result.modeId);
		this.panelInput("");
		this.clearSuggestions("Searching…");
		this.refreshSuggestions();
		this.focusSearchInput();
	}

	/** Back to Root Search with the alias selected, so Enter re-enters the mode. */
	private returnToRoot(): void {
		const alias = this.session.returnToRoot();
		this.panelInput(alias);
		this.refreshSuggestions();
		this.focusSearchInput();
		this.inputEl.select();
	}

	private panelInput(input: string): void {
		this.inputEl.value = input;
		this.inputEl.setSelectionRange(input.length, input.length);
	}

	private moveToSidebar(): void {
		// Why: copy the live input, including prefixes, the Ignored switch and the
		// fixed mode before closing. A fresh pane preserves this search without
		// replacing another sidebar palette, and closing first lets the new input
		// retain focus.
		const input = this.inputEl.value;
		const includeIgnored = this.session.current.ignoredScope;
		this.close();
		void this.plugin.paletteOpener.openNewPaletteView({
			input,
			fixedMode: this.fixedMode,
			includeIgnored,
		});
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
		if (result.mode === "mode-entry") {
			this.enterMode(result);
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
		// History stores the prefixed form; Root Search turns it back into a mode.
		this.session.returnToRoot();
		this.session.setIgnoredScope(Boolean(result.includeIgnored));
		this.ignoredToggle?.set(Boolean(result.includeIgnored));
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

	protected override handlesSuggestionPreview(): boolean {
		return true;
	}

	protected override async onSuggestionPreview(result: PaletteResult): Promise<void> {
		if (result.mode === "command" || result.mode === "mode-entry") return;
		this.session.commitCurrentSearch();
		await this.activatePaletteResult("primary", result, false);
	}
}
