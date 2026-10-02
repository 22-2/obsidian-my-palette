import { ItemView, Menu, TFile, setIcon, type WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
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
	private targetLeaf?: WorkspaceLeaf;
	private sourcePath?: string;
	private sourcePinned = false;
	private sourcePinButton?: HTMLButtonElement;
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
					void this.plugin.openNewPaletteView(
						state.input,
						state.fixedMode,
						state.sourcePath,
						state.sourcePinned,
						state,
						this.getViewType(),
					);
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
		this.sourcePinButton = undefined;
	}

	setTargetLeaf(leaf: WorkspaceLeaf | undefined): void {
		if (!leaf || !this.isCenterLeaf(leaf)) return;
		this.targetLeaf = leaf;
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
		this.sourcePath = this.sourcePinned ? state.sourcePath : this.currentSourcePath();
		// Why: sourcePath identifies the note used for searching, while targetLeaf
		// identifies the center pane that receives an open action. Keeping them
		// independent prevents a pinned search source from becoming the write target.
		this.targetLeaf = this.findTargetLeaf() ?? this.targetLeaf;
		this.contentEl.empty();
		this.contentEl.addClass("my-palette-view");

		const initialInput = state.input;
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode: state.fixedMode,
			// Why: unpinned views derive the source from the current center note;
			// passing the persisted state here would make their first search stale.
			sourceFile: this.sourceFile(this.sourcePath),
			onStateChange: (next) => this.renderState(next),
		});
		this.panel = new SuggestionPanel<PaletteResult>(this.contentEl, {
			initialInput,
			// Why: table pagination and the panel's selectable rows must share the
			// same 50-row limit even if the generic panel default changes later.
			limit: this.tableView ? PALETTE_TABLE_PAGE_SIZE : undefined,
			surface: "view",
			selectionMode: "extended",
			placeholder: palettePlaceholder(state.fixedMode ?? "file"),
			onInput: (input) => this.updateInput(input),
			onResultFocus: () => this.session?.commitCurrentSearch(),
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
		this.addSourcePinControl();
		this.addHistoryControls();
		this.registerTargetLeafTracking();
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
		const source = this.sourcePath ?? "No active note";
		const suffix = this.actionMessage ? ` · ${this.actionMessage}` : "";
		this.panel.updateFooterText(`Source: ${source}${suffix}`);
		this.updateSourcePinControl();
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

	private addSourcePinControl(): void {
		if (!this.panel) return;
		this.sourcePinButton = this.panel.statusBarEl.createEl("button", {
			cls: "clickable-icon my-palette-source-pin",
			attr: { type: "button" },
		});
		// Why: createEl appends after the result count; prepend keeps the pin action
		// immediately beside the Source label as the footer's context control.
		this.panel.statusBarEl.prepend(this.sourcePinButton);
		this.registerDomEvent(this.sourcePinButton, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.registerDomEvent(this.sourcePinButton, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.toggleSourcePin();
		});
		this.updateSourcePinControl();
	}

	private updateSourcePinControl(): void {
		if (!this.sourcePinButton) return;
		this.sourcePinButton.empty();
		setIcon(this.sourcePinButton, this.sourcePinned ? "pin-off" : "pin");
		const action = this.sourcePinned ? "Unpin source note" : "Pin source note";
		this.sourcePinButton.setAttribute("aria-label", action);
		this.sourcePinButton.setAttribute("title", action);
		this.sourcePinButton.setAttribute("aria-pressed", String(this.sourcePinned));
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
			this.updateSource(this.currentSourceFile());
			return;
		}
		const sourceFile = this.currentSourceFile();
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
		});
	}

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		const input = this.plugin.formatSearchHistoryInput(result);
		this.historyControls?.close();
		this.updateInput(input, "end", { suppressHistory: true, syncPanel: true });
		this.panel?.focusSearchInput();
	}

	private async execute(result: PaletteResult, action: ActionKind): Promise<void> {
		if (!this.session || !this.panel || result.mode === "search-history") {
			if (result.mode === "search-history") this.applySearchHistory(result);
			return;
		}
		const existingExternalLeaves = getExternalMarkdownLeaves(this.app);
		const targetLeaf = this.resolveTargetLeaf();
		const execution: PaletteResultExecutionOptions = {
			closeWhenDone: false,
			targetLeaf,
			active: action !== "primary",
			close: () => undefined,
			showError: (message) => {
				this.actionMessage = message;
				this.panel?.updateFooterText(
					`Source: ${this.sourcePath ?? "No active note"} · ${message}`,
				);
			},
		};
		await executePaletteResult(this.plugin, result, action, execution);
		this.focusPanelAfterAction(existingExternalLeaves);
	}

	private resolveTargetLeaf(): WorkspaceLeaf {
		// Clicks in the sidebar must always open in the center: never reuse a
		// sidebar leaf, and never trust a cached leaf that has moved out of
		// the main area. Prefer the current center leaf over any history.
		const active = this.app.workspace.activeLeaf;
		if (active && this.isCenterLeaf(active)) {
			this.targetLeaf = active;
			return active;
		}
		if (this.targetLeaf && this.isCenterLeaf(this.targetLeaf)) return this.targetLeaf;
		// A sidebar can be opened with no note pane at all. Allocate a normal tab
		// once so a first zap can never replace the palette view itself.
		this.targetLeaf = this.app.workspace.getLeaf("tab");
		return this.targetLeaf;
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
			this.app.workspace.activeLeaf && this.isCenterLeaf(this.app.workspace.activeLeaf)
				? this.app.workspace.activeLeaf
				: undefined;
		const activeFile = activeLeaf ? this.fileOf(activeLeaf) : undefined;
		if (activeFile) return { mocFile: activeFile, mocLeaf: activeLeaf };
		const mocLeaf = this.findTargetLeaf(this.sourcePath);
		return {
			mocFile:
				this.sourceFile(this.sourcePath) ?? (mocLeaf ? this.fileOf(mocLeaf) : null) ?? null,
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
				if (!leaf || !this.isCenterLeaf(leaf)) return;
				this.targetLeaf = leaf;
				const file = this.fileOf(leaf);
				if (!this.sourcePinned) this.updateSource(file);
			}),
		);
	}

	private currentSourceFile(): TFile | undefined {
		const activeLeaf = this.app.workspace.activeLeaf;
		if (activeLeaf && this.isCenterLeaf(activeLeaf)) return this.fileOf(activeLeaf);
		if (this.targetLeaf && this.isCenterLeaf(this.targetLeaf))
			return this.fileOf(this.targetLeaf);
		const recentLeaf = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
		return recentLeaf
			? this.fileOf(recentLeaf)
			: (this.app.workspace.getActiveFile() ?? undefined);
	}

	private currentSourcePath(): string | undefined {
		return this.currentSourceFile()?.path;
	}

	private isCenterLeaf(leaf: WorkspaceLeaf): boolean {
		// Why: a table moved into the center must never become another palette's
		// open target or source note. The shared base covers both registered views.
		if (leaf === this.leaf || leaf.view instanceof PaletteView) return false;
		try {
			// Sidebar leaves live under leftSplit/rightSplit; only rootSplit is center.
			return leaf.getRoot() === this.app.workspace.rootSplit;
		} catch {
			return true;
		}
	}

	private findTargetLeaf(sourcePath?: string): WorkspaceLeaf | undefined {
		if (
			this.targetLeaf &&
			this.isCenterLeaf(this.targetLeaf) &&
			(!sourcePath || this.fileOf(this.targetLeaf)?.path === sourcePath)
		)
			return this.targetLeaf;
		if (sourcePath) {
			let match: WorkspaceLeaf | undefined;
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (!match && this.isCenterLeaf(leaf) && this.fileOf(leaf)?.path === sourcePath)
					match = leaf;
			});
			if (match) return match;
		}
		const active = this.app.workspace.activeLeaf;
		if (active && this.isCenterLeaf(active)) return active;
		// Why: opening or restoring the sidebar can make the palette the active
		// leaf before tracking is registered. The most recent center leaf preserves
		// the user's current tab in that startup window, including non-file views.
		const recent = this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit);
		return recent && this.isCenterLeaf(recent) ? recent : undefined;
	}

	private sourceFile(sourcePath?: string) {
		if (!sourcePath) return undefined;
		const file = this.app.vault.getAbstractFileByPath(sourcePath);
		return file instanceof TFile ? file : undefined;
	}

	private fileOf(leaf: WorkspaceLeaf): import("obsidian").TFile | undefined {
		const file = (leaf.view as { file?: unknown }).file;
		return file && typeof file === "object" && "path" in file
			? (file as import("obsidian").TFile)
			: undefined;
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
