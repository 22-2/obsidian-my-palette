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
import { getCopyablePaths, toPaletteSelectionItem } from "src/palette/resultPresentation";
import { addCopyPathMenuItems, copyPathToClipboard } from "src/platform/pathClipboard";
import { SearchHistorySuggest } from "src/ui/searchHistorySuggest";
import { renderSelectionItem } from "src/ui/selectionModal";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import type { ActionKind } from "src/palette/resultActions";
import { addMocInsertionMenuItem } from "src/palette/mocInsertion";
import { PaletteHelpModal } from "src/ui/paletteHelpModal";

export const PALETTE_VIEW_TYPE = "my-palette-search";

interface PaletteViewState extends Record<string, unknown> {
	input?: unknown;
	fixedMode?: unknown;
	sourcePath?: unknown;
}

interface NormalizedPaletteViewState {
	input: string;
	fixedMode?: FixedPaletteMode;
	sourcePath?: string;
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
	private actionMessage?: string;
	private targetTrackingRegistered = false;
	private pendingState: NormalizedPaletteViewState = { input: "" };

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

	getState(): PaletteViewState {
		return {
			input: this.session?.input ?? this.pendingState.input,
			fixedMode: this.session?.fixed ?? this.pendingState.fixedMode,
			sourcePath: this.sourcePath ?? this.pendingState.sourcePath,
		};
	}

	async setState(state: PaletteViewState): Promise<void> {
		const next = normalizeState(state);
		const fixedModeChanged = next.fixedMode !== this.pendingState.fixedMode;
		const sourceChanged = next.sourcePath !== this.pendingState.sourcePath;
		this.pendingState = next;
		this.sourcePath = this.pendingState.sourcePath;
		if (!this.panel || !this.session) return;
		if (fixedModeChanged || sourceChanged) {
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
	}

	setTargetLeaf(leaf: WorkspaceLeaf | undefined): void {
		if (!leaf || leaf === this.leaf || leaf.view.getViewType() === PALETTE_VIEW_TYPE) return;
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
		this.sourcePath = state.sourcePath;
		this.targetLeaf = this.findTargetLeaf(state.sourcePath) ?? this.targetLeaf;
		this.contentEl.empty();
		this.contentEl.addClass("my-palette-view");

		const initialInput = state.input;
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode: state.fixedMode,
			sourceFile: this.sourceFile(state.sourcePath),
			onStateChange: (next) => this.renderState(next),
		});
		this.panel = new SuggestionPanel<PaletteResult>(this.contentEl, {
			initialInput,
			surface: "view",
			placeholder: palettePlaceholder(state.fixedMode ?? "file"),
			onInput: (input) => this.session?.setInput(input),
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
			onContextMenu: (result, event) => this.showContextMenu(result, event),
			onEscape: () => this.clearOrFocus(),
		});
		this.addChild(this.panel);
		this.panel.load();
		this.addSearchHistoryControls();
		this.registerTargetLeafTracking();
		this.renderState(this.session.current);
		void this.session.search(initialInput);
		this.panel.focusSearchInput();
		this.panel.setInput(initialInput, "end");
	}

	private renderState(state: PaletteSearchState): void {
		if (!this.panel) return;
		this.panel.updatePlaceholder(palettePlaceholder(state.mode));
		this.panel.setAttribute("data-mode", state.mode);
		this.panel.setAttribute("data-everything-scope", state.everythingScope);
		const source = this.sourcePath ?? this.app.workspace.getActiveFile()?.path;
		const suffix = this.actionMessage ? ` · ${this.actionMessage}` : "";
		this.panel.updateFooterText(`Source: ${source ?? "No active note"}${suffix}`);
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
		this.session.markHistoryActionStarted();
		const targetLeaf = this.resolveTargetLeaf();
		const execution: PaletteResultExecutionOptions = {
			closeWhenDone: false,
			targetLeaf,
			active: action !== "primary",
			commitSearch: () => this.session?.commitCurrentSearch(),
			close: () => undefined,
			showError: (message) => {
				this.actionMessage = message;
				this.panel?.updateFooterText(
					`Source: ${this.sourcePath ?? "No active note"} · ${message}`,
				);
			},
		};
		await executePaletteResult(this.plugin, result, action, execution);
		this.panel.focusSearchInput();
	}

	private resolveTargetLeaf(): WorkspaceLeaf {
		if (
			this.targetLeaf &&
			this.targetLeaf !== this.leaf &&
			this.targetLeaf.view.getViewType() !== PALETTE_VIEW_TYPE
		)
			return this.targetLeaf;
		const active = this.app.workspace.activeLeaf;
		if (active && active !== this.leaf && active.view.getViewType() !== PALETTE_VIEW_TYPE) {
			this.targetLeaf = active;
			return active;
		}
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
		this.session.markHistoryActionStarted();
		if (await openPaletteResultInBackground(this.plugin, result))
			this.session.commitCurrentSearch();
		this.panel?.focusSearchInput();
	}

	private showContextMenu(result: PaletteResult, event: MouseEvent): void {
		this.activeMenu?.close();
		const menu = new Menu();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
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
			addMocInsertionMenuItem(menu, this.plugin, result);
		}
		menu.setParentElement(this.contentEl);
		menu.showAtMouseEvent(event);
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
				if (!leaf || leaf === this.leaf || leaf.view.getViewType() === PALETTE_VIEW_TYPE)
					return;
				if (this.fileOf(leaf)) this.targetLeaf = leaf;
			}),
		);
	}

	private findTargetLeaf(sourcePath?: string): WorkspaceLeaf | undefined {
		if (
			this.targetLeaf &&
			this.targetLeaf !== this.leaf &&
			(!sourcePath || this.fileOf(this.targetLeaf)?.path === sourcePath)
		)
			return this.targetLeaf;
		if (sourcePath) {
			let match: WorkspaceLeaf | undefined;
			this.app.workspace.iterateAllLeaves((leaf) => {
				if (!match && this.fileOf(leaf)?.path === sourcePath) match = leaf;
			});
			if (match) return match;
		}
		const active = this.app.workspace.activeLeaf;
		return active && active !== this.leaf && active.view.getViewType() !== PALETTE_VIEW_TYPE
			? active
			: undefined;
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
	};
}
