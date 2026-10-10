import { ItemView, Menu, TFile, type WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { getLeafForAction, revealOpenedLeaf } from "src/workspace/openLeaf";
import {
	executePaletteResult,
	type PaletteResultExecutionOptions,
} from "src/palette/executePaletteResult";
import {
	PaletteSearchSession,
	palettePlaceholder,
	type FixedPaletteMode,
	type PaletteSearchState,
} from "src/palette/PaletteSearchSession";
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
import { PaletteTableControls } from "src/palette/table/PaletteTableControls";
import {
	normalizePaletteTableState,
	PALETTE_TABLE_PAGE_SIZE,
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
}

/** Persistent ItemView shell for searching while the note pane remains usable. */
export class PaletteView extends ItemView {
	navigation = false;

	private panel?: SuggestionPanel<PaletteResult>;
	private session?: PaletteSearchSession;
	private historyControls?: PaletteHistoryControls;
	private tableControls?: PaletteTableControls;
	private activeMenu?: Menu;
	private readonly leafTracker: PaletteLeafTracker;
	private readonly fileListRefresh = new FileListRefresh(
		this.app,
		(ref) => this.registerEvent(ref),
		() => this.session !== undefined,
		() => void this.session?.search(this.session.input),
	);
	private sourcePath?: string;
	private sourcePinned = false;
	private actionMessage?: string;
	private targetTrackingRegistered = false;
	private pendingState: NormalizedPaletteViewState = {
		input: "",
		sourcePinned: false,
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
		return "My Palette";
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
						? "Open new table in center"
						: "Open new palette in right sidebar",
				)
				.setIcon("plus")
				.onClick(() => {
					const state = this.newPaletteViewState();
					void this.plugin.paletteOpener.openNewPaletteView({
						input: state.input,
						fixedMode: state.fixedMode,
						sourcePath: state.sourcePath,
						sourcePinned: state.sourcePinned,
						tableState: state,
						viewType: this.getViewType(),
					});
				}),
		);
	}

	getState(): PaletteViewState {
		return {
			input: this.session?.input ?? this.pendingState.input,
			fixedMode: this.session?.fixed ?? this.pendingState.fixedMode,
			sourcePath: this.sourcePinned ? this.sourcePath : undefined,
			sourcePinned: this.sourcePinned,
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
		this.session.setInput(next.input, { suppressHistory: true });
	}

	async onOpen(): Promise<void> {
		this.createSurface(this.pendingState);
	}

	async onClose(): Promise<void> {
		if (this.session) {
			// Why: Obsidian may collect the workspace state after onClose has
			// disposed the session, so keep the last input in the fallback state too.
			this.pendingState = { ...this.pendingState, input: this.session.input };
		}
		this.fileListRefresh.cancel();
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historyControls?.destroy();
		this.historyControls = undefined;
		if (this.tableControls) this.removeChild(this.tableControls);
		this.tableControls = undefined;
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
			onStateChange: (next) => this.renderState(next),
		});
		this.panel = new SuggestionPanel<PaletteResult>(this.contentEl, {
			getHotkeys: () => this.plugin.settings.hotkeys,
			initialInput,
			// Why: table pagination and the panel's selectable rows must share the
			// same 50-row limit even if the generic panel default changes later.
			limit: this.tableView ? PALETTE_TABLE_PAGE_SIZE : undefined,
			surface: "view",
			selectionMode: "extended",
			placeholder: palettePlaceholder(state.fixedMode ?? "file"),
			onInput: (input) => this.updateInput(input),
			onResultFocus: () => {
				// Why: table row handlers stop mousedown propagation before Obsidian can
				// dismiss the result menu when a different result is clicked.
				this.activeMenu?.close();
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
			onEscape: () => this.clearOrFocus(),
			// Why: the pin is rarely toggled, so it lives in the source name's menu
			// instead of a permanent footer button; a plain click goes to the note.
			onFooterTextClick: () => void this.focusSourceNote(),
			onFooterTextContextMenu: (event) => this.showSourceMenu(event),
		});
		this.addChild(this.panel);
		this.panel.load();
		// Why: only the dedicated table view adds sorting and pagination controls;
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
		this.registerTargetLeafTracking();
		this.fileListRefresh.register();
		this.renderState(this.session.current);
		void this.session.search(initialInput);
		this.panel.setInput(initialInput, "end");
	}

	focusSearchInput(): void {
		this.panel?.focusSearchInput();
	}

	private newPaletteViewState(): NormalizedPaletteViewState {
		// Duplicate the pin state as well as the query: an unpinned view should keep
		// following the active note, while a pinned view should remain reproducible.
		return {
			input: this.session?.input ?? this.pendingState.input,
			fixedMode: this.session?.fixed ?? this.pendingState.fixedMode,
			sourcePath: this.sourcePinned ? this.sourcePath : undefined,
			sourcePinned: this.sourcePinned,
			...normalizePaletteTableState(this.tableControls?.getState() ?? this.pendingState),
		};
	}

	private renderState(state: PaletteSearchState): void {
		if (!this.panel) return;
		this.panel.updatePlaceholder(palettePlaceholder(state.mode));
		this.panel.setAttribute("data-mode", state.mode);
		this.panel.setAttribute("data-everything-scope", state.everythingScope);
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
		const target = getLeafForAction(this.app, "primary", this.leafTracker.resolveTargetLeaf());
		await target.openFile(file);
		await revealOpenedLeaf(this.app, target);
	}

	private showSourceMenu(event: MouseEvent): void {
		this.activeMenu?.close();
		const menu = new Menu();
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
		menu.showAtMouseEvent(event);
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
		});
	}

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		const input = this.plugin.formatSearchHistoryInput(result);
		this.historyControls?.close();
		this.updateInput(input, "end", { suppressHistory: true, syncPanel: true });
		this.panel?.focusSearchInput();
	}

	private async execute(
		result: PaletteResult,
		action: ActionKind,
		targetOverride?: WorkspaceLeaf,
		reuseExternalMarkdownLeaf = true,
	): Promise<void> {
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
		if (!this.session || result.mode === "search-history") {
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
		const activeLeaf = this.app.workspace.activeLeaf;
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
		const menu = new Menu();
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
		});
		menu.setParentElement(this.contentEl);
		menu.showAtMouseEvent(event);
	}

	private resolveMocInsertionContext(): MocInsertionContext {
		// The sidebar palette keeps focus in its search input, so a cached
		// sourcePath/targetLeaf can point at the previously active note. Prefer
		// the currently active center note at click time.
		const activeLeaf =
			this.app.workspace.activeLeaf &&
			this.leafTracker.isCenterLeaf(this.app.workspace.activeLeaf)
				? this.app.workspace.activeLeaf
				: undefined;
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
		this.pendingState = { ...this.pendingState, input };
		if (options.syncPanel) this.panel?.setInput(input, selection);
		if (options.suppressHistory) this.session?.setInputFromHistory(input);
		else this.session?.setInput(input);
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
		state.fixedMode === "smart"
			? state.fixedMode
			: undefined;
	return {
		input: typeof state.input === "string" ? state.input : "",
		fixedMode,
		sourcePath: typeof state.sourcePath === "string" ? state.sourcePath : undefined,
		sourcePinned: state.sourcePinned === true,
		...normalizePaletteTableState(state),
	};
}
