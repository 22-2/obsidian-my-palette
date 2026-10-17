import { ItemView, Menu, TFile, type WorkspaceLeaf } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { openFileInLeaf, revealOpenedLeaf } from "src/workspace/openLeaf";
import {
	executePaletteResult,
	type PaletteResultExecutionOptions,
} from "src/palette/executePaletteResult";
import {
	PaletteSearchSession,
	palettePlaceholder,
	paletteRouteChrome,
	paletteSectionOf,
	type FixedPaletteMode,
	type PaletteSearchState,
} from "src/palette/PaletteSearchSession";
import type { PaletteModeId } from "src/palette/modes";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { toPaletteSelectionItem } from "src/palette/resultPresentation";
import { renderSelectionItem } from "src/ui/selectionModal";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import type { ActionKind } from "src/palette/resultActions";
import type { MocInsertionContext } from "src/moc-relateds/mocInsertion";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";
import {
	getExternalMarkdownLeaves,
	isExternalMarkdownLeaf,
} from "src/workspace/external-markdown/openExternalMarkdown";
import { PaletteHistoryControls } from "src/palette/components/PaletteHistoryControls";
import { PALETTE_HISTORY_CATEGORIES } from "src/palette/searchHistory";
import { ignoredToggleOptions, syncIgnoredToggle } from "src/palette/ignoredToggle";
import type { PanelSwitch } from "src/ui/panelSwitch";
import { createAuditKindChoice, syncAuditKindChoice } from "src/palette/auditKindChoice";
import type { AuditKind } from "src/audit/vaultAudit";
import type { PanelChoice } from "src/ui/panelChoice";
import { PaletteTableControls } from "src/palette/table/PaletteTableControls";
import {
	normalizePaletteTableState,
	type PaletteTableState,
} from "src/palette/table/paletteTableModel";

import { FileListRefresh } from "src/palette/surfaces/fileListRefresh";
import { PaletteLeafTracker } from "src/palette/surfaces/paletteLeafTracker";
import { PALETTE_VIEW_TYPE, type PaletteViewType } from "src/palette/surfaces/paletteViewTypes";

interface PaletteViewState extends Record<string, unknown> {
	input?: unknown;
	fixedMode?: unknown;
	sourcePath?: unknown;
	sourcePinned?: unknown;
	includeIgnored?: unknown;
	displayMode?: unknown;
	sorting?: unknown;
	columnOrder?: unknown;
	hiddenColumns?: unknown;
}

interface NormalizedPaletteViewState extends PaletteTableState {
	input: string;
	fixedMode?: FixedPaletteMode;
	sourcePath?: string;
	sourcePinned: boolean;
	includeIgnored: boolean;
}

/** Persistent ItemView shell for searching while the note pane remains usable. */
export class PaletteView extends ItemView {
	navigation = false;

	private panel?: SuggestionPanel<PaletteResult>;
	private session?: PaletteSearchSession;
	private historyControls?: PaletteHistoryControls;
	private tableControls?: PaletteTableControls;
	private ignoredToggle?: PanelSwitch;
	private auditKindChoice?: PanelChoice<AuditKind>;
	private activeMenu?: PaletteMenu;
	private readonly leafTracker: PaletteLeafTracker;
	private readonly fileListRefresh = new FileListRefresh(
		this.app,
		(ref) => this.registerEvent(ref),
		() => this.session !== undefined,
		() => void this.session?.search(this.session.input, { keepResults: true }),
	);
	private sourcePath?: string;
	private sourcePinned = false;
	private actionMessage?: string;
	private targetTrackingRegistered = false;
	private pendingState: NormalizedPaletteViewState = {
		input: "",
		sourcePinned: false,
		includeIgnored: false,
		...normalizePaletteTableState({}),
	};

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: MyPalettePlugin,
	) {
		super(leaf);
		this.leafTracker = new PaletteLeafTracker(
			this.app,
			leaf,
			(view) => view instanceof PaletteView,
		);
		this.pendingState.displayMode = this.tableView ? "table" : "list";
	}

	protected get tableView(): boolean {
		return false;
	}

	getViewType(): PaletteViewType {
		return PALETTE_VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Sidebar palette";
	}

	getIcon(): string {
		return "search";
	}

	override onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		menu.addItem((item) =>
			item
				.setTitle(
					this.tableView
						? "Open new table palette in center"
						: "Open new palette in right sidebar",
				)
				.setIcon("plus")
				.onClick(() => {
					const state = this.snapshotState();
					void this.plugin.paletteOpener.openNewPaletteView({
						input: state.input,
						fixedMode: state.fixedMode,
						sourcePath: state.sourcePath,
						sourcePinned: state.sourcePinned,
						includeIgnored: state.includeIgnored,
						tableState: state,
						viewType: this.getViewType(),
					});
				}),
		);
	}

	getState(): PaletteViewState {
		return { ...this.snapshotState() };
	}

	private snapshotState(): NormalizedPaletteViewState {
		return {
			input: this.session?.prefixedInput ?? this.pendingState.input,
			fixedMode: this.pendingState.fixedMode,
			sourcePath: this.sourcePinned ? this.sourcePath : undefined,
			sourcePinned: this.sourcePinned,
			includeIgnored: this.ignoredScope,
			...normalizePaletteTableState(this.tableControls?.getState() ?? this.pendingState),
		};
	}

	async setState(state: PaletteViewState): Promise<void> {
		// Why: the registered view type owns presentation. Ignore legacy List/Table
		// state so restoring a pane cannot turn a regular palette into a table.
		const next = normalizeState({ ...state, displayMode: this.tableView ? "table" : "list" });
		const fixedModeChanged = next.fixedMode !== this.pendingState.fixedMode;
		const sourceChanged = next.sourcePath !== this.pendingState.sourcePath;
		const sourcePinChanged = next.sourcePinned !== this.pendingState.sourcePinned;
		this.pendingState = next;
		this.sourcePinned = this.pendingState.sourcePinned;
		this.sourcePath = this.sourcePinned ? this.pendingState.sourcePath : undefined;
		if (!this.panel || !this.session) return;
		if (fixedModeChanged || sourceChanged || sourcePinChanged) {
			this.createSurface(this.pendingState);
			return;
		}
		this.tableControls?.setState(next);
		this.panel.setInput(next.input, "end");
		this.session.setIgnoredScope(next.includeIgnored);
		this.ignoredToggle?.set(next.includeIgnored);
		// The saved input carries its alias; Home turns it back into a mode.
		this.session.returnToHome();
		this.session.setInput(next.input, { suppressHistory: true });
	}

	async onOpen(): Promise<void> {
		this.createSurface(this.pendingState);
	}

	async onClose(): Promise<void> {
		if (this.session) {
			// Why: Obsidian may collect the workspace state after onClose has
			// disposed the session, so keep the last input in the fallback state too.
			this.pendingState = {
				...this.pendingState,
				input: this.session.prefixedInput,
				includeIgnored: this.session.current.ignoredScope,
			};
		}
		this.fileListRefresh.cancel();
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historyControls?.destroy();
		this.historyControls = undefined;
		if (this.tableControls) this.removeChild(this.tableControls);
		this.tableControls = undefined;
		this.ignoredToggle = undefined;
		this.auditKindChoice = undefined;
		this.session?.dispose();
		this.session = undefined;
		if (this.panel) this.removeChild(this.panel);
		this.panel = undefined;
	}

	private createSurface(state: NormalizedPaletteViewState): void {
		this.activeMenu?.close();
		this.historyControls?.destroy();
		this.historyControls = undefined;
		if (this.tableControls) this.removeChild(this.tableControls);
		this.tableControls = undefined;
		this.session?.dispose();
		if (this.panel) this.removeChild(this.panel);
		this.session = undefined;
		this.panel = undefined;
		this.actionMessage = undefined;
		this.pendingState = state;
		this.sourcePinned = state.sourcePinned;
		this.sourcePath = this.sourcePinned
			? state.sourcePath
			: this.leafTracker.currentSourceFile()?.path;
		// Why: sourcePath identifies the note used for searching, while targetLeaf
		// identifies the center pane that receives an open action. Keeping them
		// independent prevents a pinned search source from becoming the write target.
		this.leafTracker.refresh();
		this.contentEl.empty();
		this.contentEl.addClass("my-palette-view");

		const initialInput = state.input;
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode: state.fixedMode,
			// Why: unpinned views derive the source from the current center note;
			// passing the persisted state here would make their first search stale.
			sourceFile: this.leafTracker.sourceFile(this.sourcePath),
			includeIgnored: state.includeIgnored,
			// Table columns describe files, so the table offers modes only by alias.
			modeEntries: !this.tableView,
			onStateChange: (next) => this.renderState(next),
		});
		// A fixed mode is now just the starting mode; persist it as an alias instead.
		this.pendingState = {
			...this.pendingState,
			fixedMode: undefined,
			input: this.session.prefixedInput,
		};
		this.panel = new SuggestionPanel<PaletteResult>(this.contentEl, {
			getHotkeys: () => this.plugin.settings.hotkeys,
			initialInput,
			surface: "view",
			selectionMode: "extended",
			placeholder: palettePlaceholder(state.fixedMode ?? "file"),
			onInput: (input) => this.updateInput(input),
			onResultFocus: () => {
				// Entering a mode is navigation; the alias typed to reach it is not a search.
				const mode = this.panel?.getSelectedItem()?.mode;
				if (mode === "mode-entry") return;
				this.session?.commitCurrentSearch();
			},
			renderSuggestion: (result, el, query) =>
				renderSelectionItem(
					toPaletteSelectionItem(this.app, result, {
						openExternalMarkdownInObsidian:
							this.plugin.settings.openExternalMarkdownInObsidian,
					}),
					el,
					query,
				),
			onChoose: (result) => this.execute(result, "primary"),
			onMiddleClick: (result) => this.openInBackground(result),
			onContextMenu: (result, event, selectedItems) =>
				this.showContextMenu(result, event, selectedItems),
			onEscape: () => {
				if (this.session?.current.route.kind === "mode") this.returnToHome();
				else this.clearOrFocus();
			},
			onEmptyBackspace: () => {
				if (this.session?.current.route.kind !== "mode") return false;
				this.returnToHome();
				return true;
			},
			onModeChipClick: () => this.returnToHome(),
			onTab: (result) => {
				if (result.mode !== "mode-entry") return false;
				this.enterMode(result.modeId);
				return true;
			},
			sectionOf: (result) => paletteSectionOf(this.session?.current, result),
			// Why: the pin is rarely toggled, so it lives in the source name's menu
			// instead of a permanent footer button; a plain click goes to the note.
			onFooterTextClick: () => void this.focusSourceNote(),
			onFooterTextContextMenu: (event) => this.showSourceMenu(event),
		});
		this.addChild(this.panel);
		this.panel.load();
		// Why: only the dedicated table view adds sorting and column controls;
		// both views still use the same search session and result actions.
		if (this.tableView) {
			this.tableControls = new PaletteTableControls(this.panel, this.app, {
				initialState: state,
				presentation: (result) =>
					toPaletteSelectionItem(this.app, result, {
						openExternalMarkdownInObsidian:
							this.plugin.settings.openExternalMarkdownInObsidian,
					}),
				onChange: (tableState) => {
					// The same query can have different sort priorities in separate panes.
					// Save presentation in the leaf layout rather than global file settings.
					this.pendingState = { ...this.pendingState, ...tableState };
					void this.app.workspace.requestSaveLayout();
				},
			});
			this.addChild(this.tableControls);
			this.tableControls.load();
		}
		this.addHistoryControls();
		this.ignoredToggle = this.panel.addSwitch(
			ignoredToggleOptions(state.includeIgnored, (value) => this.setIgnoredScope(value)),
		);
		this.auditKindChoice = createAuditKindChoice(this.plugin, () => {
			if (!this.session) return;
			this.renderState(this.session.current);
			void this.session.search(this.session.input);
		});
		this.registerTargetLeafTracking();
		this.fileListRefresh.register();
		this.renderState(this.session.current);
		// Set the raw input first: a search that enters a mode replaces it with the query.
		this.panel.setInput(initialInput, "end");
		void this.session.search(initialInput);
	}

	focusSearchInput(): void {
		this.panel?.focusSearchInput();
	}

	private get ignoredScope(): boolean {
		return this.session?.current.ignoredScope ?? this.pendingState.includeIgnored;
	}

	private renderState(state: PaletteSearchState): void {
		if (!this.panel || !this.session) return;
		// `alias + Space` moves into a mode and leaves only the query behind.
		if (this.panel.inputEl.value !== state.input) this.panel.setInput(state.input, "end");
		const chrome = paletteRouteChrome(
			state,
			this.session.modeAlias,
			!this.tableView,
			this.plugin.settings.audit.kind,
		);
		this.panel.updatePlaceholder(chrome.placeholder);
		this.panel.setModeChip(chrome.chip);
		this.panel.setAttribute("data-route", state.route.kind);
		this.panel.setAttribute("data-mode", state.mode);
		this.panel.setAttribute("data-everything-scope", state.everythingScope);
		syncIgnoredToggle(this.ignoredToggle, state.mode);
		syncAuditKindChoice(this.auditKindChoice, state.mode, this.plugin.settings.audit.kind);
		this.renderFooter(this.actionMessage);
		const results = {
			items: state.results,
			total: state.resultCount,
			error: state.error,
		};
		if (this.tableControls) this.tableControls.setResults(results);
		else this.panel.setResults(results);
		this.actionMessage = undefined;
		this.historyControls?.update(state.input);
	}

	private renderFooter(message?: string): void {
		const source = this.sourcePath ?? "No active note";
		const suffix = message ? ` · ${message}` : "";
		// Why: the pin has no button of its own, so a pinned source is the only
		// state the footer must show; an unpinned source follows the active note.
		this.panel?.updateFooterText(
			`Source: ${source}${suffix}`,
			this.sourcePinned ? "pin" : undefined,
		);
	}

	private async focusSourceNote(): Promise<void> {
		const file = this.leafTracker.sourceFile(this.sourcePath);
		if (!file) return;
		const leaf = this.leafTracker.findTargetLeaf(file.path);
		if (leaf && this.leafTracker.fileOf(leaf)?.path === file.path) {
			await revealOpenedLeaf(this.app, leaf);
			return;
		}
		// The note is not open in the center: open it where a primary action would.
		await openFileInLeaf(this.app, file, {
			action: "primary",
			targetLeaf: this.leafTracker.resolveTargetLeaf(),
			active: true,
			autoFocus: true,
			focusExisting: this.plugin.settings.focusExistingTab,
		});
	}

	private showSourceMenu(event: MouseEvent): void {
		this.activeMenu?.close();
		const menu = new PaletteMenu();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		const canPin = this.sourcePinned || this.leafTracker.currentSourceFile() !== undefined;
		menu.addItem((item) =>
			item
				.setTitle(this.sourcePinned ? "Unpin source note" : "Pin source note")
				.setIcon(this.sourcePinned ? "pin-off" : "pin")
				.setDisabled(!canPin)
				.onClick(() => this.toggleSourcePin()),
		);
		menu.setParentElement(this.contentEl);
		showMenuAtEvent(menu, event);
	}

	private toggleSourcePin(): void {
		if (!this.session) return;
		if (this.sourcePinned) {
			this.sourcePinned = false;
			this.pendingState = {
				...this.pendingState,
				sourcePinned: false,
				sourcePath: undefined,
			};
			this.updateSource(this.leafTracker.currentSourceFile());
			return;
		}
		const sourceFile = this.leafTracker.currentSourceFile();
		if (!sourceFile) return;
		this.sourcePinned = true;
		this.sourcePath = sourceFile.path;
		this.pendingState = {
			...this.pendingState,
			sourcePinned: true,
			sourcePath: this.sourcePath,
		};
		this.session.setSourceFile(sourceFile);
		this.renderState(this.session.current);
	}

	private updateSource(sourceFile: TFile | undefined): void {
		const nextPath = sourceFile?.path;
		const changed = nextPath !== this.sourcePath;
		this.sourcePath = nextPath;
		this.pendingState = {
			...this.pendingState,
			sourcePath: this.sourcePinned ? nextPath : undefined,
			sourcePinned: this.sourcePinned,
		};
		if (changed) this.session?.setSourceFile(sourceFile);
		if (this.session) this.renderState(this.session.current);
	}

	private addHistoryControls(): void {
		if (!this.panel) return;
		const container = this.panel.inputEl.parentElement;
		if (!container) return;
		this.historyControls = new PaletteHistoryControls({
			plugin: this.plugin,
			surface: this.tableView ? "table" : "view",
			historyCategories: PALETTE_HISTORY_CATEGORIES,
			inputEl: this.panel.inputEl,
			containerEl: container,
			hostEl: this.contentEl,
			getContext: (input) =>
				this.session?.getSearchHistoryContext(input) ?? {
					query: "",
					category: "file",
					includeIgnored: false,
				},
			apply: (result) => this.applySearchHistory(result),
			focusInput: () => this.panel?.focusSearchInput(),
			getSwitches: () => this.panel?.switchList ?? [],
			getChoices: () => (this.auditKindChoice ? [this.auditKindChoice] : []),
			showHighlightOption: false,
		});
	}

	private setIgnoredScope(value: boolean): void {
		if (!this.session) return;
		this.session.setIgnoredScope(value);
		this.pendingState = { ...this.pendingState, includeIgnored: value };
		void this.session.search(this.session.input);
		void this.app.workspace.requestSaveLayout();
	}

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		const input = this.plugin.formatSearchHistoryInput(result);
		this.historyControls?.close();
		// History stores the prefixed form; Home turns it back into a mode.
		this.session?.returnToHome();
		this.session?.setIgnoredScope(Boolean(result.includeIgnored));
		this.ignoredToggle?.set(Boolean(result.includeIgnored));
		this.updateInput(input, "end", { suppressHistory: true, syncPanel: true });
		this.panel?.focusSearchInput();
	}

	private async execute(
		result: PaletteResult,
		action: ActionKind,
		targetOverride?: WorkspaceLeaf,
		reuseExternalMarkdownLeaf = true,
	): Promise<void> {
		if (result.mode === "mode-entry") {
			this.enterMode(result.modeId);
			return;
		}
		if (!this.session || !this.panel || result.mode === "search-history") {
			if (result.mode === "search-history") this.applySearchHistory(result);
			return;
		}
		// Why: explicit main-window navigation must bypass the currently active
		// popout and any cached target leaf belonging to the palette.
		const targetLeaf = targetOverride ?? this.leafTracker.resolveTargetLeaf();
		const execution: PaletteResultExecutionOptions = {
			closeWhenDone: false,
			targetLeaf,
			reuseExternalMarkdownLeaf,
			// Opening a note is a navigation action: focus the destination rather
			// than returning to this palette's input after the open completes.
			active: true,
			close: () => undefined,
			showError: (message) => {
				this.actionMessage = message;
				this.renderFooter(message);
			},
		};
		await executePaletteResult(this.plugin, result, action, execution);
	}

	private async openInBackground(result: PaletteResult): Promise<void> {
		if (!this.session || result.mode === "search-history" || result.mode === "mode-entry") {
			if (result.mode === "search-history") this.applySearchHistory(result);
			return;
		}
		const existingExternalLeaves = getExternalMarkdownLeaves(this.app);
		await openPaletteResultInBackground(this.plugin, result);
		this.focusPanelAfterAction(existingExternalLeaves);
	}

	private async openInMainWindow(result: PaletteResult): Promise<void> {
		const { workspace } = this.app;
		// Why: this menu action promises a fresh main-window tab on every use,
		// including external Markdown that already has a tab in the same window.
		const target = workspace.createLeafInParent(workspace.rootSplit, 0);
		await this.execute(result, "primary", target, false);
	}

	private focusPanelAfterAction(existingExternalLeaves: readonly WorkspaceLeaf[]): void {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		// Reusing an external Markdown leaf reveals the requested tab. Focusing the sidebar
		// input afterward would immediately activate the palette again and undo it.
		if (
			activeLeaf &&
			existingExternalLeaves.includes(activeLeaf) &&
			isExternalMarkdownLeaf(activeLeaf)
		)
			return;
		this.panel?.focusSearchInput();
	}

	private showContextMenu(
		result: PaletteResult,
		event: MouseEvent,
		selectedItems: PaletteResult[],
	): void {
		this.activeMenu?.close();
		const menu = new PaletteMenu();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		populatePaletteResultMenu({
			app: this.app,
			plugin: this.plugin,
			menu,
			result,
			selectedItems,
			activate: (action, selected) => this.execute(selected, action),
			openInBackground: (selected) => this.openInBackground(selected),
			// Why: compare owning documents at menu-open time so moving the same
			// view between windows immediately updates the available navigation action.
			openInMainWindow:
				this.contentEl.ownerDocument !== this.app.workspace.rootSplit.doc
					? (selected) => this.openInMainWindow(selected)
					: undefined,
			applySearchHistory: (history) => this.applySearchHistory(history),
			getMocContext: () => this.resolveMocInsertionContext(),
			onResultsChanged: () => void this.session?.search(this.session.input),
		});
		menu.setParentElement(this.contentEl);
		showMenuAtEvent(menu, event);
	}

	private resolveMocInsertionContext(): MocInsertionContext {
		// The sidebar palette keeps focus in its search input, so a cached
		// sourcePath/targetLeaf can point at the previously active note. Prefer
		// the currently active center note at click time.
		const recentLeaf = this.app.workspace.getMostRecentLeaf();
		const activeLeaf =
			recentLeaf && this.leafTracker.isCenterLeaf(recentLeaf) ? recentLeaf : undefined;
		const activeFile = activeLeaf ? this.leafTracker.fileOf(activeLeaf) : undefined;
		if (activeFile) return { mocFile: activeFile, mocLeaf: activeLeaf };
		const mocLeaf = this.leafTracker.findTargetLeaf(this.sourcePath);
		return {
			mocFile:
				this.leafTracker.sourceFile(this.sourcePath) ??
				(mocLeaf ? this.leafTracker.fileOf(mocLeaf) : null) ??
				null,
			mocLeaf,
		};
	}

	private enterMode(modeId: PaletteModeId): void {
		if (!this.session || !this.panel) return;
		this.session.enterMode(modeId);
		this.panel.setInput("", "end");
		// Empty the list now; a slow provider would otherwise show Home rows.
		this.panel.setResults({ items: [], total: 0, error: "Searching…" });
		this.updateInput("", "end");
		this.panel.focusSearchInput();
	}

	/** Back to Home with the alias selected, so Enter re-enters the mode. */
	private returnToHome(): void {
		if (!this.session || !this.panel) return;
		const alias = this.session.returnToHome();
		this.updateInput(alias, "all", { syncPanel: true });
		this.panel.focusSearchInput();
		this.panel.inputEl.select();
	}

	private clearOrFocus(): void {
		if (!this.panel) return;
		if (this.panel.inputEl.value) {
			this.updateInput("", "end", { syncPanel: true });
		} else {
			this.panel.focusSearchInput();
		}
	}

	private updateInput(
		input: string,
		selection: "all" | "end" | "none" = "none",
		options: { suppressHistory?: boolean; syncPanel?: boolean } = {},
	): void {
		// Why: getState() is the per-leaf persistence boundary, but Obsidian does
		// not necessarily request a layout save for each DOM input event. Updating
		// the fallback and requesting a debounced save keeps the leaf's latest query
		// available even if the view is deferred or closed immediately afterward.
		if (options.syncPanel) this.panel?.setInput(input, selection);
		if (options.suppressHistory) this.session?.setInputFromHistory(input);
		else this.session?.setInput(input);
		// Store the alias-prefixed form so a restored pane re-enters the same mode.
		this.pendingState = { ...this.pendingState, input: this.session?.prefixedInput ?? input };
		void this.app.workspace.requestSaveLayout();
	}

	private registerTargetLeafTracking(): void {
		if (this.targetTrackingRegistered) return;
		this.targetTrackingRegistered = true;
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// Why: a non-Markdown center view can still be the user's current tab
				// and must be replaced by a primary open. Track the leaf independently
				// from fileOf(), which is only needed for source-note searches.
				if (!leaf || !this.leafTracker.track(leaf)) return;
				const file = this.leafTracker.fileOf(leaf);
				if (!this.sourcePinned) this.updateSource(file);
			}),
		);
	}
}

function normalizeState(state: PaletteViewState): NormalizedPaletteViewState {
	const fixedMode =
		state.fixedMode === "link" ||
		state.fixedMode === "backlink" ||
		state.fixedMode === "bookmark" ||
		state.fixedMode === "smart" ||
		state.fixedMode === "tab"
			? state.fixedMode
			: undefined;
	return {
		input: typeof state.input === "string" ? state.input : "",
		fixedMode,
		sourcePath: typeof state.sourcePath === "string" ? state.sourcePath : undefined,
		sourcePinned: state.sourcePinned === true,
		includeIgnored: state.includeIgnored === true,
		...normalizePaletteTableState(state),
	};
}
