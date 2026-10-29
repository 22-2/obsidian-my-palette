import { ItemView, Menu, Scope, TFile, type WorkspaceLeaf } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import type MyPalettePlugin from "src/main";
import {
	choosingOpensMenu,
	type PaletteMode,
	type PaletteResult,
	usesSourceNote,
} from "src/palette/results";
import { canPreviewResult } from "src/palette/resultPreview";
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
import { SuggestionPanel, type SuggestionPanelResults } from "src/ui/suggestionPanel";
import type { ActionKind } from "src/palette/resultActions";
import type { MocInsertionContext } from "src/moc-relateds/mocInsertion";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";
import {
	getExternalMarkdownLeaves,
	isExternalMarkdownLeaf,
} from "src/workspace/external-markdown/openExternalMarkdown";
import { PaletteHistoryControls } from "src/palette/components/PaletteHistoryControls";
import { PALETTE_HISTORY_CATEGORIES } from "src/palette/searchHistory";
import {
	isPaletteSortableMode,
	PALETTE_SORT_KEYS,
	paletteSortPresentation,
} from "src/palette/paletteSorting";
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
import { ICONS } from "src/ui/icons";
import {
	DEFAULT_HOTKEYS,
	HOTKEY_ACTIONS,
	matchesHotkey,
	worksIn,
	type HotkeyAction,
} from "src/ui/hotkeys";
import { t } from "src/i18n";

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

/** メモを表示したままでも検索できる、常駐の ItemView の外枠。 */
export class PaletteView extends ItemView {
	navigation = false;

	private panel?: SuggestionPanel<PaletteResult>;
	private session?: PaletteSearchSession;
	private homeView?: { activeIndex: number; scrollTop: number; id?: string };
	private restoringHome = false;
	private lastRoute: PaletteSearchState["route"]["kind"] = "home";
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
		() => this.containerEl.isShown(),
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
		return t("view.sidebarPalette");
	}

	getIcon(): string {
		return "search";
	}

	override onPaneMenu(menu: Menu, source: string): void {
		super.onPaneMenu(menu, source);
		menu.addItem((item) =>
			item
				.setTitle(
					this.tableView ? t("view.openNewTableCenter") : t("view.openNewRightSidebar"),
				)
				.setIcon(ICONS.openNewPalette)
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
		// Why: 登録されたビューの種類が表示形式を決める。古い一覧・表の状態は無視し、
		// ペインを復元したときに通常のパレットが表になってしまわないようにする。
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
		this.homeView = undefined;
		this.tableControls?.setState(next);
		this.panel.setInput(next.input, "end");
		this.session.setIgnoredScope(next.includeIgnored);
		this.ignoredToggle?.set(next.includeIgnored);
		// 保存された入力にはエイリアスが含まれる。Home がそれをモードに戻す。
		this.session.returnToHome();
		this.session.setInput(next.input);
	}

	async onOpen(): Promise<void> {
		this.scope = new Scope(this.app.scope);
		this.scope.register(null, null, (event) => {
			const panel = this.panel;
			if (!panel || event.isComposing) return;
			const hotkeys = this.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS;
			const ownsShortcut = (Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).some(
				(action) =>
					worksIn(HOTKEY_ACTIONS[action].scopes, "palette") &&
					(action !== "sortMenu" || this.historyControls?.canOpenSortMenu()) &&
					matchesHotkey(event, hotkeys[action]) &&
					(event.target === panel.inputEl ||
						(action === "hidePreview" &&
							event.targetNode &&
							this.contentEl.contains(event.targetNode))),
			);
			// Obsidian は window のキャプチャ中にスコープを確認し、パネルの DOM ハンドラーより前に行う。
			// true を返すと、グローバルのショートカットは飛ばしつつ、パネル側のハンドラーは動かし続ける。
			if (ownsShortcut) return true;
		});
		this.createSurface(this.pendingState);
	}

	async onClose(): Promise<void> {
		if (this.session) {
			// Why: onClose でセッションを破棄したあとに、Obsidian がワークスペースの状態を
			// 集めることがあるため、最後の入力を予備の状態にも残しておく。
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
		this.homeView = undefined;
		this.restoringHome = false;
		this.lastRoute = "home";
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
		// Why: sourcePath は検索に使うノートを表し、targetLeaf は開く操作を受け取る中央のペインを表す。
		// 別々に保つことで、ピン留めした検索元が書き込み先になってしまうのを防ぐ。
		this.leafTracker.refresh();
		this.contentEl.empty();
		this.contentEl.addClass("my-palette-view");

		const initialInput = state.input;
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode: state.fixedMode,
			// Why: ピン留めされていない表示は、元のノートを現在の中央のノートから決める。
			// ここで保存された状態を渡すと、最初の検索が古くなってしまうため。
			sourceFile: this.leafTracker.sourceFile(this.sourcePath),
			includeIgnored: state.includeIgnored,
			// 表の列はファイルを表すので、表ではエイリアスによるモードだけを出す。
			modeEntries: !this.tableView,
			onStateChange: (next) => this.renderState(next),
		});
		// 固定のモードは、今では単なる開始時のモードになった。代わりにエイリアスとして保存する。
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
				// モードに入るのはナビゲーションであり、そこへ入るために打ったエイリアスは検索ではない。
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
					{ foldKana: this.plugin.settings.file.foldKana },
				),
			onChoose: (result) => {
				if (choosingOpensMenu(result)) this.panel?.showActiveRowContextMenu();
				else void this.execute(result, "primary");
			},
			onMiddleClick: (result) => this.openInBackground(result),
			onContextMenu: (result, event, selectedItems) =>
				this.showContextMenu(result, event, selectedItems),
			onEscape: () => {
				if (this.session && this.session.current.route.kind !== "home") this.returnToHome();
				else this.clearOrFocus();
			},
			onEmptyBackspace: () => {
				if (!this.session || this.session.current.route.kind === "home") return false;
				this.returnToHome();
				return true;
			},
			onModeChipClick: () => this.returnToHome(),
			onTab: (result) => {
				if (result.mode !== "mode-entry") return false;
				if (!result.unavailable) this.enterMode(result.modeId);
				return true;
			},
			onPreview: (result) => this.preview(result),
			sectionOf: (result) => paletteSectionOf(this.session?.current, result),
			// Why: ピン留めはめったに切り替えないので、常設のフッターボタンではなく元のノート名の
			// メニューに置く。通常のクリックはノートに移動する。
			onFooterTextClick: () => void this.focusSourceNote(),
			onFooterTextContextMenu: (event) => this.showSourceMenu(event),
		});
		this.addChild(this.panel);
		this.panel.load();
		// Why: 並び順と列の操作を追加するのは専用の表のビューだけ。どちらのビューも
		// 同じ検索セッションと結果の操作を使う。
		if (this.tableView) {
			this.tableControls = new PaletteTableControls(this.panel, this.app, {
				initialState: state,
				presentation: (result) =>
					toPaletteSelectionItem(this.app, result, {
						openExternalMarkdownInObsidian:
							this.plugin.settings.openExternalMarkdownInObsidian,
					}),
				foldKana: () => this.plugin.settings.file.foldKana,
				// Why: Vault 監査は種類ごとに別のものを一覧にし、それぞれ列が異なる。
				columnSet: () =>
					this.session?.current.mode === "audit"
						? this.plugin.settings.audit.kind
						: "files",
				onChange: (tableState) => {
					// 同じクエリでも、別のペインでは並び順の優先度が違うことがある。
					// 表示の設定はファイルの全体設定ではなく、ペインのレイアウトに保存する。
					this.pendingState = { ...this.pendingState, ...tableState };
					this.updateSortStatus();
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
		// 生の入力を先にセットする。モードに入る検索は、それをクエリに置き換えるため。
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
		if (this.lastRoute === "home" && state.route.kind !== "home") this.rememberHomeView();
		this.lastRoute = state.route.kind;
		// 「エイリアス + Space」でモードに入り、残るのはクエリだけになる。
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
		this.updateSortStatus();
		syncIgnoredToggle(this.ignoredToggle, state.mode);
		syncAuditKindChoice(this.auditKindChoice, state.mode, this.plugin.settings.audit.kind);
		this.renderFooter(state.mode, this.actionMessage);
		const results = {
			items: state.results,
			total: state.resultCount,
			error: state.error,
			loading: state.loading,
		};
		this.setResultsKeepingSelection(results);
		this.actionMessage = undefined;
		this.historyControls?.update(state.input);
	}

	private updateSortStatus(): void {
		if (!this.panel || !this.session) return;
		const sorting = this.tableControls
			? this.tableControls.getSort()
			: this.session.getSorting();
		this.panel.updateSortStatus(paletteSortPresentation(sorting));
	}

	/**
	 * 結果を描き直しても、選んでいた項目とスクロール位置を保つ。ノートを開いた後や、メタデータの
	 * 変更で再検索されたときに、選択が先頭の行へ戻ってしまうのを防ぐため。
	 */
	private setResultsKeepingSelection(results: SuggestionPanelResults<PaletteResult>): void {
		if (!this.panel) return;
		const selected = this.panel.getSelectedItems();
		const active = this.panel.getSelectedItem();
		const scrollTop = this.panel.currentView.scrollTop;
		if (this.tableControls) this.tableControls.setResults(results);
		else this.panel.setResults(results);
		if (this.restoringHome) {
			if (!results.loading) this.restoringHome = false;
			return;
		}
		if (!active) return;
		const { values } = this.panel.chooser;
		const indexOf = (item: PaletteResult) => values.findIndex(({ id }) => id === item.id);
		this.panel.restoreSelection(
			selected.map(indexOf).filter((index) => index >= 0),
			indexOf(active),
		);
		this.panel.resultContainerEl.scrollTop = scrollTop;
	}

	private renderFooter(mode: PaletteMode, message?: string): void {
		// 元のノートを読まないモードでは、元ファイルを出さず、通知だけを出す。
		if (!usesSourceNote(mode)) {
			this.panel?.updateFooterText(message ?? "");
			return;
		}
		const source = this.sourcePath ?? t("view.noActiveNote");
		const suffix = message ? ` · ${message}` : "";
		// Why: ピン留めには専用のボタンがないので、フッターが示す必要があるのはピン留めの状態だけ。
		// ピン留めされていない元のノートは、アクティブなノートに従う。
		this.panel?.updateFooterText(
			`${t("view.source", { source })}${suffix}`,
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
		// ノートが中央で開いていなければ、主な操作で開く場所に開く。
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
				.setTitle(this.sourcePinned ? t("view.unpinSource") : t("view.pinSource"))
				.setIcon(this.sourcePinned ? ICONS.unpin : ICONS.pin)
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
			getSortOptions: () => {
				const state = this.session?.current;
				if (!state || state.route.kind === "other" || !isPaletteSortableMode(state.mode))
					return [];
				return this.tableControls
					? ["name", "path", "modified", "prior"]
					: PALETTE_SORT_KEYS;
			},
			getSorting: () => this.tableControls?.getSort() ?? this.session?.getSorting(),
			setSorting: (sorting) => {
				if (this.tableControls) this.tableControls.setSort(sorting);
				else this.session?.setSorting(sorting);
			},
			apply: (result) => this.applySearchHistory(result),
			openSettings: () => this.plugin.openSettings(),
			focusInput: () => this.panel?.focusSearchInput(),
			getSwitches: () => this.panel?.switchList ?? [],
			getChoices: () => (this.auditKindChoice ? [this.auditKindChoice] : []),
			showHighlightOption: false,
			showFileSearchOptions: true,
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
		this.homeView = undefined;
		const input = this.plugin.formatSearchHistoryInput(result);
		this.historyControls?.close();
		// 履歴はプレフィックス付きの形で保存する。Home がそれをモードに戻す。
		this.session?.returnToHome();
		this.session?.setIgnoredScope(Boolean(result.includeIgnored));
		this.ignoredToggle?.set(Boolean(result.includeIgnored));
		this.updateInput(input, "end", { syncPanel: true });
		this.panel?.focusSearchInput();
	}

	/**
	 * 右矢印のプレビューは、結果を見せるが、フォーカスはこのビューの入力欄に残す。
	 * モーダル版と同じ判定と操作で、タブのモードも同じように切り替えて見せる。
	 */
	private async preview(result: PaletteResult): Promise<void> {
		if (!canPreviewResult(result)) return;
		this.session?.commitCurrentSearch();
		await this.execute(result, "primary", undefined, true, false);
	}

	private async execute(
		result: PaletteResult,
		action: ActionKind,
		targetOverride?: WorkspaceLeaf,
		reuseExternalMarkdownLeaf = true,
		autoFocus = true,
	): Promise<void> {
		if (result.mode === "mode-entry") {
			if (!result.unavailable) this.enterMode(result.modeId);
			return;
		}
		if (!this.session || !this.panel || result.mode === "search-history") {
			if (result.mode === "search-history") this.applySearchHistory(result);
			return;
		}
		// Why: 明示的なメインウィンドウへの移動は、いま有効なポップアウトや、
		// パレットが持つキャッシュ済みの対象リーフを必ず迂回する。
		const targetLeaf = targetOverride ?? this.leafTracker.resolveTargetLeaf();
		const execution: PaletteResultExecutionOptions = {
			closeWhenDone: false,
			targetLeaf,
			reuseExternalMarkdownLeaf,
			// ノートを開くのはナビゲーションなので、開き終えた後にこのパレットの入力へ戻るのではなく、
			// 移動先にフォーカスを当てる。
			active: true,
			autoFocus,
			close: () => undefined,
			showError: (message) => {
				this.actionMessage = message;
				this.renderFooter(this.session?.current.mode ?? "file", message);
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
		// Why: このメニュー操作は、使うたびに新しいメインウィンドウのタブを開くことを約束する。
		// 同じウィンドウにタブがすでにある外部の Markdown も含めて。
		const target = workspace.createLeafInParent(workspace.rootSplit, 0);
		await this.execute(result, "primary", target, false);
	}

	private focusPanelAfterAction(existingExternalLeaves: readonly WorkspaceLeaf[]): void {
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		// 既存の外部 Markdown のリーフを再利用すると、要求されたタブが表示される。その後にサイドバーの
		// 入力へフォーカスすると、パレットがすぐまた前面に出て、表示を元に戻してしまうため。
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
			// Why: メニューを開いた時点で所有するドキュメントを比べる。同じビューをウィンドウ間で移すと、
			// 使えるナビゲーションの操作がすぐに更新されるようにするため。
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
		// サイドバーのパレットは検索入力にフォーカスを保つので、キャッシュされた
		// sourcePath/targetLeaf が直前にアクティブだったノートを指すことがある。
		// クリックの時点で、いま中央でアクティブなノートを優先する。
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

	private enterMode(modeId: PaletteModeId | "other"): void {
		if (!this.session || !this.panel) return;
		if (this.session.current.route.kind === "home") this.rememberHomeView();
		this.session.enterMode(modeId);
		this.panel.setInput("", "end");
		// 一覧は今すぐ空にする。遅いプロバイダーだと、Home の行が見えてしまうため。
		this.panel.setResults({ items: [], total: 0, loading: true });
		this.updateInput("", "end");
		this.panel.focusSearchInput();
	}

	private rememberHomeView(): void {
		if (!this.panel || this.homeView) return;
		this.homeView = { ...this.panel.currentView, id: this.panel.getSelectedItem()?.id };
	}

	/** 入力を空にして Home に戻り、元の一覧位置を復元する。 */
	private returnToHome(): void {
		if (!this.session || !this.panel) return;
		this.session.returnToHome();
		const view = this.homeView;
		this.homeView = undefined;
		if (view) {
			this.restoringHome = true;
			this.panel.restoreView(view, (item) => item.id === view.id);
		}
		this.updateInput("", "end", { syncPanel: true });
		this.panel.focusSearchInput();
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
		options: { syncPanel?: boolean } = {},
	): void {
		// Why: getState() はリーフごとの保存の境界だが、Obsidian は DOM の入力イベントのたびに
		// レイアウトの保存を要求するとは限らない。予備の状態を更新し、遅延した保存を要求しておけば、
		// ビューが遅れて閉じられても、リーフの最新のクエリが残るため。
		if (options.syncPanel) this.panel?.setInput(input, selection);
		this.session?.setInput(input);
		// エイリアス付きの形で保存し、復元されたペインが同じモードに入り直せるようにする。
		this.pendingState = { ...this.pendingState, input: this.session?.prefixedInput ?? input };
		void this.app.workspace.requestSaveLayout();
	}

	private registerTargetLeafTracking(): void {
		if (this.targetTrackingRegistered) return;
		this.targetTrackingRegistered = true;
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				// Why: 中央の Markdown 以外のビューも、ユーザーの現在のタブであることがあり、
				// 主な操作で置き換えられる必要がある。fileOf() はノートを元にする検索のためだけに必要なので、
				// リーフは fileOf() とは独立に追跡する。
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
