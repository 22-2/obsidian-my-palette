import type { App, TFile } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import type MyPalettePlugin from "src/main";
import {
	choosingOpensMenu,
	type EverythingScope,
	type PaletteMode,
	type PaletteResult,
} from "src/palette/results";
import {
	SelectionModal,
	type SelectionHighlightOptions,
	type SelectionItem,
} from "src/ui/selectionModal";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { canPreviewResult } from "src/palette/resultPreview";
import type { ActionKind } from "src/palette/resultActions";
import {
	PaletteSearchSession,
	paletteRouteChrome,
	paletteSectionOf,
	type FixedPaletteMode,
	type PaletteSearchState,
} from "src/palette/PaletteSearchSession";
import { toPaletteSelectionItem } from "src/palette/resultPresentation";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";
import { PaletteHistoryControls } from "src/palette/components/PaletteHistoryControls";
import type { PaletteRestoreState } from "src/palette/restoreState";
import { PALETTE_HISTORY_CATEGORIES } from "src/palette/searchHistory";
import { ignoredToggleOptions, syncIgnoredToggle } from "src/palette/ignoredToggle";
import { createAuditKindChoice, syncAuditKindChoice } from "src/palette/auditKindChoice";
import type { AuditKind } from "src/audit/vaultAudit";
import type { PanelChoice } from "src/ui/panelChoice";
import type { PanelSwitch } from "src/ui/panelSwitch";
import { t } from "src/i18n";

export interface PaletteModalOptions {
	/** Home ではファイルの上にモードの一覧を出す。ファイルだけのパレットでは off にする。 */
	modeEntries?: boolean;
	/** 再開できるほど最近閉じられたパレットの状態。 */
	restore?: PaletteRestoreState;
	/** 元のノートに依存するモード(リンク、プロパティ)が、アクティブなノートの代わりに読むノート。 */
	sourceFile?: TFile;
	/** プロパティで一緒に編集する複数のノート。フッターはその件数を出す。 */
	sourceFiles?: readonly TFile[];
}

function sourceFooterText(app: App, sourceFile?: TFile, sourceFiles?: readonly TFile[]): string {
	if (sourceFiles && sourceFiles.length > 1)
		return t("palette.source.notes", { count: sourceFiles.length });
	return t("view.source", {
		source: sourceFile?.path ?? app.workspace.getActiveFile()?.path ?? t("view.noActiveNote"),
	});
}

export class PaletteModal extends SelectionModal<PaletteResult> {
	private readonly session: PaletteSearchSession;
	private suppressHistoryForNextInput = false;
	private activeMenu?: PaletteMenu;
	private historyControls?: PaletteHistoryControls;
	private ignoredToggle?: PanelSwitch;
	private auditKindChoice?: PanelChoice<AuditKind>;
	private mode: PaletteMode = "file";
	private everythingScope: EverythingScope = "vault";
	private state?: PaletteSearchState;
	private homeView?: { activeIndex: number; scrollTop: number; id?: string };
	private readonly modeEntries: boolean;
	private readonly restore?: PaletteRestoreState;

	constructor(
		app: App,
		private readonly plugin: MyPalettePlugin,
		initialInput = "",
		fixedMode?: FixedPaletteMode,
		{ modeEntries = false, restore, sourceFile, sourceFiles }: PaletteModalOptions = {},
	) {
		super(
			{
				title: t("palette.title.files"),
				getHotkeys: () => plugin.settings.hotkeys,
				placeholder: t("palette.placeholder.files"),
				initialInput,
				selectionMode: "extended",
				footerText: sourceFooterText(app, sourceFile, sourceFiles),
			},
			app,
		);
		this.modeEntries = modeEntries;
		this.restore = restore;
		this.session = new PaletteSearchSession(this.plugin, {
			initialInput,
			fixedMode,
			modeEntries,
			sourceFile,
			sourceFiles,
			includeIgnored: restore?.includeIgnored ?? false,
			onModesChange: () => this.refreshSuggestions(),
			onStateChange: (state) => {
				if (this.state?.route.kind === "home" && state.route.kind !== "home")
					this.rememberHomeView();
				this.state = state;
				// `alias + Space` moves into a mode and leaves only the query behind.
				if (this.inputEl.value !== state.input) this.panelInput(state.input);
				this.mode = state.mode;
				this.everythingScope = state.everythingScope;
				this.updateMatchQuery(state.query);
				this.updateMode();
				this.updateResultCount(state.resultCount);
				if (state.error) this.emptyStateText = state.error;
				// Why: 残す結果がない検索は、古い行の代わりにスピナーを出す。背景の再読み込みは結果を残す。
				if (state.loading && !state.results.length) this.clearSuggestions();
			},
		});
	}

	protected override onSelectionModalOpen(): void {
		// SelectionModal が初期の入力を適用して更新する。
		if (this.restore) this.restoreResultView(this.restore);
		this.historyControls = new PaletteHistoryControls({
			plugin: this.plugin,
			surface: "palette",
			historyCategories: PALETTE_HISTORY_CATEGORIES,
			inputEl: this.inputEl,
			containerEl: this.inputEl.parentElement ?? this.modalEl,
			hostEl: this.modalEl,
			getContext: (input) => this.session.getSearchHistoryContext(input),
			apply: (result) => this.applySearchHistory(result),
			openSettings: () => {
				this.close();
				this.plugin.openSettings();
			},
			focusInput: () => this.focusSearchInput(),
			moveToSidebar: () => this.moveToSidebar(),
			getSwitches: () => this.switches,
			getChoices: () => (this.auditKindChoice ? [this.auditKindChoice] : []),
			showHighlightOption: false,
			showFileSearchOptions: true,
		});
		this.auditKindChoice = createAuditKindChoice(this.plugin, () => {
			this.updateMode();
			this.refreshSuggestions();
		});
		this.ignoredToggle = this.addSwitch(
			ignoredToggleOptions(this.session.current.ignoredScope, (value) => {
				this.session.setIgnoredScope(value);
				this.refreshSuggestions();
			}),
		);
		syncIgnoredToggle(this.ignoredToggle, this.mode);
	}

	/** 次の「ホームを開く」で再開するもの: 入力、範囲のオプション、行とスクロール位置。 */
	private captureRestoreState(): PaletteRestoreState {
		return {
			input: this.session.prefixedInput,
			includeIgnored: this.session.current.ignoredScope,
			...this.currentResultView(),
		};
	}

	protected override onSelectionModalClose(): void {
		this.plugin.paletteOpener.releaseModal(this);
		this.plugin.paletteOpener.rememberClosedPalette(this.captureRestoreState());
		// このセッションが要求のシグナルを持つ。共有のクライアントをここでキャンセルすると、
		// まだ開いているサイドバーのビューの検索も中断してしまうため。
		this.session.dispose();
		this.activeMenu?.close();
		this.activeMenu = undefined;
		this.historyControls?.destroy();
		this.historyControls = undefined;
		this.ignoredToggle = undefined;
		this.auditKindChoice = undefined;
	}

	protected override highlightOptions(): SelectionHighlightOptions {
		return { foldKana: this.plugin.settings.file.foldKana };
	}

	protected override toSelectionItem(result: PaletteResult): SelectionItem {
		return toPaletteSelectionItem(this.app, result, {
			openExternalMarkdownInObsidian: this.plugin.settings.openExternalMarkdownInObsidian,
		});
	}

	protected override async onItemActivated(result: PaletteResult, _event: Event): Promise<void> {
		if (choosingOpensMenu(result)) {
			this.showActiveRowContextMenu();
			return;
		}
		await this.activatePaletteResult("primary", result);
	}

	protected override onResultFocus(): void {
		// モードに入るのはナビゲーションであり、そこへ入るために打ったエイリアスは検索ではない。
		const mode = this.getSelectedItem()?.mode;
		if (mode === "mode-entry") return;
		this.session.commitCurrentSearch();
	}

	protected override async onSuggestionMiddleClick(result: PaletteResult): Promise<void> {
		if (result.mode === "search-history") {
			this.applySearchHistory(result);
			return;
		}
		const activeLeaf = this.app.workspace.getMostRecentLeaf();
		try {
			await this.openResultInBackground(result);
		} finally {
			if (activeLeaf && this.app.workspace.getMostRecentLeaf() !== activeLeaf)
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
		const menu = this.replaceActiveMenu(new PaletteMenu());
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
			onNoteActionDone: () => this.close(),
			onResultsChanged: () => this.refreshSuggestions(),
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
		const state = this.state ?? this.session.current;
		this.modalEl.setAttribute("data-route", state.route.kind);
		const chrome = paletteRouteChrome(
			state,
			this.session.modeAlias,
			this.modeEntries,
			this.plugin.settings.audit.kind,
		);
		this.updatePlaceholder(chrome.placeholder);
		this.setModeChip(chrome.chip);
		this.modalEl.setAttribute("data-mode", this.mode);
		this.modalEl.setAttribute("data-everything-scope", this.everythingScope);
		syncIgnoredToggle(this.ignoredToggle, this.mode);
		syncAuditKindChoice(this.auditKindChoice, this.mode, this.plugin.settings.audit.kind);
	}

	protected override sectionOf(result: PaletteResult): string | undefined {
		return paletteSectionOf(this.state, result);
	}

	protected override onSuggestionEscape(): void {
		if (this.state && this.state.route.kind !== "home") this.returnToHome();
		else this.close();
	}

	protected override onEmptyBackspace(): boolean {
		if (this.state?.route.kind === "home" || !this.state) return false;
		this.returnToHome();
		return true;
	}

	protected override onSuggestionTab(result: PaletteResult): boolean {
		if (result.mode !== "mode-entry") return false;
		this.enterMode(result);
		return true;
	}

	protected override onModeChipClick(): void {
		this.returnToHome();
	}

	private enterMode(result: Extract<PaletteResult, { mode: "mode-entry" }>): void {
		if (result.unavailable) return;
		if (this.session.current.route.kind === "home") this.rememberHomeView();
		this.session.enterMode(result.modeId);
		this.panelInput("");
		this.clearSuggestions();
		this.refreshSuggestions();
		this.focusSearchInput();
	}

	private rememberHomeView(): void {
		if (this.homeView) return;
		this.homeView = { ...this.currentResultView(), id: this.getSelectedItem()?.id };
	}

	/** 入力を空にして Home に戻り、元の一覧位置を復元する。 */
	private returnToHome(): void {
		this.session.returnToHome();
		const view = this.homeView;
		this.homeView = undefined;
		if (view) this.restoreResultView(view, (item) => item.id === view.id);
		this.panelInput("");
		this.refreshSuggestions();
		this.focusSearchInput();
	}

	private panelInput(input: string): void {
		this.inputEl.value = input;
		this.inputEl.setSelectionRange(input.length, input.length);
	}

	private moveToSidebar(): void {
		// Why: 閉じる前に、いまの検索と Obsidian の除外ファイルのオプションをコピーする。エイリアス付きの
		// 入力にはモードが含まれるので、新しいペインは同じモードに入り直す。
		// 新しいペインは、ほかのサイドバーのパレットを置き換えずに、この検索を残す。
		// 閉じてから開くので、新しい入力がフォーカスを保てる。
		const input = this.session.prefixedInput;
		const includeIgnored = this.session.current.ignoredScope;
		this.close();
		void this.plugin.paletteOpener.openNewPaletteView({ input, includeIgnored });
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
		this.homeView = undefined;
		this.historyControls?.close();
		this.suppressHistoryForNextInput = true;
		// 履歴はプレフィックス付きの形で保存する。Home がそれをモードに戻す。
		this.session.returnToHome();
		this.session.setIgnoredScope(Boolean(result.includeIgnored));
		this.ignoredToggle?.set(Boolean(result.includeIgnored));
		this.inputEl.value = this.plugin.formatSearchHistoryInput(result);
		this.refreshSuggestions();
		this.inputEl.focus({ preventScroll: true });
		this.inputEl.setSelectionRange(this.inputEl.value.length, this.inputEl.value.length);
	}

	private replaceActiveMenu(menu: PaletteMenu): PaletteMenu {
		this.activeMenu?.close();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		return menu;
	}

	private async openResultInBackground(result: PaletteResult): Promise<void> {
		// Why: 裏で開いてもパレットは閉じないので、成功時の
		// 操作の挙動を、結果の一覧をクリックしていない呼び出し元のために残す。
		await openPaletteResultInBackground(this.plugin, result);
	}

	protected override handlesSuggestionPreview(): boolean {
		return true;
	}

	protected override async onSuggestionPreview(result: PaletteResult): Promise<void> {
		if (!canPreviewResult(result)) return;
		this.session.commitCurrentSearch();
		await this.activatePaletteResult("primary", result, false);
	}
}
