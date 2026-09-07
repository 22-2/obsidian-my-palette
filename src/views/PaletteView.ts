import { ItemView, Menu, TFile, setIcon, type WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/model/results";
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
import {
	getCopyablePaths,
	isCopyablePaletteResult,
	toPaletteSelectionItem,
} from "src/palette/resultPresentation";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";
import { renderSelectionItem } from "src/ui/selectionModal";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import type { ActionKind } from "src/palette/resultActions";
import { addMocInsertionMenuItem, type MocInsertionContext } from "src/palette/mocInsertion";
import { PaletteHelpModal } from "src/ui/paletteHelpModal";
import { EXTERNAL_MARKDOWN_VIEW_TYPE } from "src/views/ExternalMarkdownView";

export const PALETTE_VIEW_TYPE = "my-palette-search";

interface PaletteViewState extends Record<string, unknown> {
	input?: unknown;
	fixedMode?: unknown;
	sourcePath?: unknown;
	sourcePinned?: unknown;
}

interface NormalizedPaletteViewState {
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
	private historySuggest?: SearchHistorySuggest;
	private activeMenu?: Menu;
	private targetLeaf?: WorkspaceLeaf;
	private sourcePath?: string;
	private sourcePinned = false;
	private sourcePinButton?: HTMLButtonElement;
	private actionMessage?: string;
	private targetTrackingRegistered = false;
	private pendingState: NormalizedPaletteViewState = { input: "", sourcePinned: false };

	constructor(
		leaf: WorkspaceLeaf,
		private readonly plugin: MyPalettePlugin,
	) {
		super(leaf);
	}

	getViewType(): string {
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
				.setTitle("Open new palette in right sidebar")
				.setIcon("plus")
				.onClick(() => {
					const state = this.newPaletteViewState();
					void this.plugin.openNewPaletteView(
						state.input,
						state.fixedMode,
						state.sourcePath,
						state.sourcePinned,
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
		};
	}

	async setState(state: PaletteViewState): Promise<void> {
		const next = normalizeState(state);
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
		this.panel.setInput(next.input, "end");
		this.session.setInput(next.input, { suppressHistory: true });
	}

	async onOpen(): Promise<void> {
		this.createSurface(this.pendingState);
	}

	async onClose(): Promise<void> {
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historySuggest?.destroy();
		this.historySuggest = undefined;
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
		this.historySuggest?.destroy();
		this.historySuggest = undefined;
		this.session?.dispose();
		if (this.panel) this.removeChild(this.panel);
		this.session = undefined;
		this.panel = undefined;
		this.actionMessage = undefined;
		this.pendingState = state;
		this.sourcePinned = state.sourcePinned;
		this.sourcePath = this.sourcePinned ? state.sourcePath : this.currentSourcePath();
		this.targetLeaf = this.findTargetLeaf(state.sourcePath) ?? this.targetLeaf;
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
			surface: "view",
			selectionMode: "extended",
			placeholder: palettePlaceholder(state.fixedMode ?? "file"),
			onInput: (input) => this.session?.setInput(input),
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
		this.addSourcePinControl();
		this.addSearchHistoryControls();
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
		this.panel.setResults({
			items: state.results,
			total: state.resultCount,
			error: state.error,
		});
		this.actionMessage = undefined;
		const history = this.session?.getSearchHistoryContext(state.input);
		if (history)
			this.historySuggest?.update(
				this.plugin.getSearchHistorySuggestions(
					history.query,
					history.category,
					history.includeIgnored,
				),
			);
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

	private addSearchHistoryControls(): void {
		if (!this.panel) return;
		const container = this.panel.inputEl.parentElement;
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
		this.registerDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.registerDomEvent(button, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.toggleSearchHistorySuggest();
		});
		const helpButton = container.createEl("button", {
			cls: "clickable-icon my-palette-help-button",
			attr: { type: "button", "aria-label": "Palette help", title: "Palette help" },
		});
		setIcon(helpButton, "help-circle");
		this.registerDomEvent(helpButton, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.registerDomEvent(helpButton, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			new PaletteHelpModal(this.app, this.plugin.settings.prefixes).open();
		});
		this.historySuggest = new SearchHistorySuggest(container, (result) =>
			this.applySearchHistory(result),
		);
		this.registerDomEvent(this.panel.inputEl, "input", () => {
			if (!this.historySuggest?.isOpen) return;
			const history = this.session?.getSearchHistoryContext(this.panel?.inputEl.value ?? "");
			if (history)
				this.historySuggest.update(
					this.plugin.getSearchHistorySuggestions(
						history.query,
						history.category,
						history.includeIgnored,
					),
				);
		});
		this.registerDomEvent(
			this.panel.inputEl,
			"keydown",
			(event) => {
				if (event.key === "Escape" && this.historySuggest?.isOpen) {
					event.preventDefault();
					event.stopImmediatePropagation();
					this.historySuggest.close();
					return;
				}
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
				if (event.key === "Enter" && this.historySuggest.selectCurrent()) {
					event.preventDefault();
					event.stopImmediatePropagation();
				}
			},
			true,
		);
		this.registerDomEvent(document, "mousedown", (event) => {
			const target = event.target;
			if (
				!(target instanceof Node) ||
				!this.historySuggest?.isOpen ||
				this.historySuggest.contains(target) ||
				target === this.panel?.inputEl ||
				(target instanceof Element && target.closest(".my-palette-history-button"))
			)
				return;
			this.historySuggest.close();
		});
	}

	private showSearchHistorySuggest(): void {
		if (!this.panel || !this.session) return;
		const history = this.session.getSearchHistoryContext(this.panel.inputEl.value);
		this.historySuggest?.show(
			this.plugin.getSearchHistorySuggestions(
				history.query,
				history.category,
				history.includeIgnored,
			),
		);
		this.panel.focusSearchInput();
		this.panel.setInput(this.panel.inputEl.value, "end");
	}

	private toggleSearchHistorySuggest(): void {
		if (this.historySuggest?.isOpen) {
			this.historySuggest.close();
			return;
		}
		this.showSearchHistorySuggest();
	}

	private applySearchHistory(result: Extract<PaletteResult, { mode: "search-history" }>): void {
		const input = this.plugin.formatSearchHistoryInput(result);
		this.historySuggest?.close();
		this.panel?.setInput(input, "end");
		this.session?.setInputFromHistory(input);
		this.panel?.focusSearchInput();
	}

	private async execute(result: PaletteResult, action: ActionKind): Promise<void> {
		if (!this.session || !this.panel || result.mode === "search-history") {
			if (result.mode === "search-history") this.applySearchHistory(result);
			return;
		}
		const existingExternalLeaves = this.app.workspace.getLeavesOfType(
			EXTERNAL_MARKDOWN_VIEW_TYPE,
		);
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
		const existingExternalLeaves = this.app.workspace.getLeavesOfType(
			EXTERNAL_MARKDOWN_VIEW_TYPE,
		);
		await openPaletteResultInBackground(this.plugin, result);
		this.focusPanelAfterAction(existingExternalLeaves);
	}

	private focusPanelAfterAction(existingExternalLeaves: readonly WorkspaceLeaf[]): void {
		const activeLeaf = this.app.workspace.activeLeaf;
		// Reusing a ReadOnly leaf reveals the requested tab. Focusing the sidebar
		// input afterward would immediately activate the palette again and undo it.
		if (
			activeLeaf &&
			existingExternalLeaves.includes(activeLeaf) &&
			activeLeaf.view.getViewType() === EXTERNAL_MARKDOWN_VIEW_TYPE
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
		const selectedPaths = selectedItems
			.filter(isCopyablePaletteResult)
			.map((item) => getCopyablePaths(this.app, item))
			.filter(({ fileName, relativePath, absolutePath }) =>
				Boolean(fileName || relativePath || absolutePath),
			);
		if (selectedPaths.length > 1) {
			// Why: bulk open/MOC actions have unclear failure and focus semantics;
			// keep the multi-selection menu limited to non-mutating clipboard work.
			addCopyPathListMenuItems(
				menu,
				selectedPaths,
				(values) => void copyPathListToClipboard(values),
			);
			menu.setParentElement(this.contentEl);
			menu.showAtMouseEvent(event);
			return;
		}
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
					.onClick(() => void this.execute(result, "primary")),
			);
		} else {
			const paths = getCopyablePaths(this.app, result);
			menu.addItem((item) =>
				item
					.setTitle("Open")
					.setIcon("external-link")
					.onClick(() => void this.execute(result, "primary")),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open in new tab (background)")
					.setIcon("panel-top-open")
					.onClick(() => void this.openInBackground(result)),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open side by side")
					.setIcon("separator-vertical")
					.onClick(() => void this.execute(result, "vertical")),
			);
			menu.addItem((item) =>
				item
					.setTitle("Open below")
					.setIcon("separator-horizontal")
					.onClick(() => void this.execute(result, "horizontal")),
			);
			if (result.mode === "everything") {
				menu.addSeparator();
				menu.addItem((item) =>
					item
						.setTitle("Show in file explorer")
						.setIcon("folder-open")
						.onClick(() => void this.execute(result, "alternate")),
				);
			}
			addCopyPathMenuItems(menu, paths, (path) => void copyPathToClipboard(path));
			// Keep the potentially mutating MOC operation below navigation and copy
			// actions so the menu follows familiar file-manager conventions.
			addMocInsertionMenuItem(menu, this.plugin, result, undefined, () =>
				this.resolveMocInsertionContext(),
			);
		}
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
			this.panel.setInput("", "end");
			this.session?.setInput("");
		} else {
			this.panel.focusSearchInput();
		}
	}

	private registerTargetLeafTracking(): void {
		if (this.targetTrackingRegistered) return;
		this.targetTrackingRegistered = true;
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// Only center leaves can change the unpinned source; sidebar focus
				// (including this palette) must never overwrite the active note.
				if (!leaf || !this.isCenterLeaf(leaf)) return;
				const file = this.fileOf(leaf);
				if (file) this.targetLeaf = leaf;
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
		if (leaf === this.leaf || leaf.view.getViewType() === PALETTE_VIEW_TYPE) return false;
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
		return active && this.isCenterLeaf(active) ? active : undefined;
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
	};
}
