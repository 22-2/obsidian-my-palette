import { Plugin, type WorkspaceLeaf } from "obsidian";
import log, { LogLevels } from "consola";
import { DEFAULT_SETTINGS, MyPaletteSettingTab } from "src/settings";
import type { LeafOpenAction } from "src/workspace/openLeaf";
import type { MyPaletteSettings } from "src/settings/model";
import {
	createPaletteProviders,
	type PaletteProviderInstances,
} from "src/app/createPaletteProviders";
import { registerPluginCommands } from "src/app/registerCommands";
import { registerPluginEvents } from "src/app/registerEvents";
import { openExternalMarkdown } from "src/workspace/external-markdown/openExternalMarkdown";
import { PaletteModal } from "src/palette/PaletteModal";
import type { FixedPaletteMode } from "src/palette/PaletteSearchSession";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import {
	PALETTE_VIEW_TYPE,
	PALETTE_TABLE_VIEW_TYPE,
	type PaletteViewType,
} from "src/palette/surfaces/paletteViewTypes";
import type { PaletteTableState } from "src/palette/table/paletteTableModel";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";
import {
	getResultFilePath,
	type PaletteMode,
	type PaletteResult,
	type SearchHistoryResult,
} from "src/palette/results";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/settings/model";
import { formatSearchHistoryInput, SEARCH_HISTORY_MAX_ENTRIES } from "src/palette/searchHistory";
import {
	loadPluginSettings,
	savePluginSettings,
	type LoadedPluginSettings,
} from "src/settings/settingsStore";
import { FileUsageHistory } from "src/search/file/fileUsageHistory";
import { RecentCommandService } from "src/search/command/recentCommandService";
import { SearchHistoryService } from "src/palette/searchHistoryService";
import { RecentTagStore } from "src/tags/recentTagStore";
import { PaletteDisplaySettingsStore } from "src/settings/paletteDisplaySettingsStore";
import "../styles.css";

const logger = log.withTag("MyPalette");
const debugLog = (message: string, detail?: unknown): void => logger.debug(message, detail);

export default class MyPalettePlugin extends Plugin {
	settings: MyPaletteSettings = DEFAULT_SETTINGS;
	readonly paletteDisplaySettings = new PaletteDisplaySettingsStore(
		() => this.settings,
		() => this.saveSettings(),
	);
	readonly everythingClient = new EverythingHttpClient(debugLog);
	fileProvider!: PaletteProviderInstances["fileProvider"];
	commandProvider!: PaletteProviderInstances["commandProvider"];
	everythingProvider!: PaletteProviderInstances["everythingProvider"];
	relatedFileProvider!: PaletteProviderInstances["relatedFileProvider"];
	bookmarkProvider!: PaletteProviderInstances["bookmarkProvider"];
	smartConnectionProvider!: PaletteProviderInstances["smartConnectionProvider"];
	providers!: PaletteProviderInstances["providers"];
	private fileUsageHistory?: FileUsageHistory;
	private searchHistory?: SearchHistoryService;
	private recentCommands?: RecentCommandService;
	recentTagStore!: RecentTagStore;
	private rememberedPaletteQueries: Partial<Record<PaletteMode, string>> = {};
	private activePaletteModal?: PaletteModal;

	async onload(): Promise<void> {
		const loadedSettings = await this.loadSettings();
		this.initializeLogger();
		const saveLegacyFallback = () => void this.saveSettings();
		this.searchHistory = new SearchHistoryService(this.app, debugLog, saveLegacyFallback);
		await this.searchHistory.load(
			loadedSettings.legacySearchHistoryEntries,
			this.settings.searchHistory.daysToKeep,
		);
		this.recentCommands = new RecentCommandService(this.app, debugLog, saveLegacyFallback);
		await this.recentCommands.load(loadedSettings.legacyRecentCommandIds);
		if (loadedSettings.shouldSave) await this.saveSettings();
		this.recentTagStore = new RecentTagStore(this.app, debugLog);
		// Recent tags were never stored in data.json, so there is nothing to migrate.
		await this.recentTagStore.load();
		this.fileUsageHistory = new FileUsageHistory(this.app, debugLog);
		await this.fileUsageHistory.load();
		registerPluginEvents(this);
		const providers = createPaletteProviders(this.app, this.everythingClient, {
			vaultExtensions: () => this.settings.everything.vaultExtensions,
			fileSortPriorities: () => this.settings.file.sortPriorities,
			excludedFolders: () => this.settings.file.excludedFolders,
			demotedPriorFolders: () => this.settings.file.demotedPriorFolders,
			recentCommandIds: () => this.recentCommands?.getIds() ?? [],
			everythingSettings: () => this.settings.everything,
			fileUsageHistory: this.fileUsageHistory,
			log: debugLog,
		});
		this.fileProvider = providers.fileProvider;
		this.commandProvider = providers.commandProvider;
		this.everythingProvider = providers.everythingProvider;
		this.relatedFileProvider = providers.relatedFileProvider;
		this.bookmarkProvider = providers.bookmarkProvider;
		this.smartConnectionProvider = providers.smartConnectionProvider;
		this.providers = providers.providers;
		this.addSettingTab(new MyPaletteSettingTab(this));
		registerPluginCommands(this);
	}

	openPalette(initialInput = "", fixedMode?: FixedPaletteMode): void {
		if (this.activePaletteModal) {
			this.activePaletteModal.focusSearchInput();
			return;
		}
		const existingInput = document.querySelector<HTMLInputElement>(
			".my-palette-suggest-modal .prompt-input",
		);
		if (existingInput) {
			existingInput.focus({ preventScroll: true });
			return;
		}
		const modal = new PaletteModal(this.app, this, initialInput, fixedMode);
		this.activePaletteModal = modal;
		modal.open();
	}

	async openPaletteView(
		initialInput = this.getRememberedPaletteQuery("file"),
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		await this.openSidebarPaletteView(PALETTE_VIEW_TYPE, initialInput, fixedMode);
	}

	async openPaletteTableView(
		initialInput = this.getRememberedPaletteQuery("file"),
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		// Why: reuse a center table without overwriting its query. A new tab keeps
		// the current note intact and avoids reopening a restored sidebar table.
		const existing = this.app.workspace
			.getLeavesOfType(PALETTE_TABLE_VIEW_TYPE)
			.find((leaf) => leaf.getRoot() === this.app.workspace.rootSplit);
		const leaf = existing ?? this.app.workspace.getLeaf("tab");
		if (!existing) {
			await leaf.setViewState({
				type: PALETTE_TABLE_VIEW_TYPE,
				active: true,
				state: this.paletteViewState(initialInput, fixedMode),
			});
		}
		await this.app.workspace.revealLeaf(leaf);
		this.focusPaletteView(leaf);
	}

	private async openSidebarPaletteView(
		viewType: PaletteViewType,
		initialInput: string,
		fixedMode?: FixedPaletteMode,
	): Promise<void> {
		// Why: reuse only the requested view type, so opening a table cannot replace
		// the regular palette's query or its independently persisted sidebar pane.
		const hasRightSidebarPalette = this.app.workspace
			.getLeavesOfType(viewType)
			.some((leaf) => leaf.getRoot() === this.app.workspace.rightSplit);
		// Why: PaletteView.getState() is stored independently by Obsidian for each
		// leaf. Passing the plugin-wide remembered input every time would overwrite
		// that leaf's own query when the sidebar command is invoked again.
		const options = {
			active: true,
			reveal: true,
			...(hasRightSidebarPalette
				? {}
				: { state: this.paletteViewState(initialInput, fixedMode) }),
		};
		const leaf = await this.app.workspace.ensureSideLeaf(viewType, "right", options);
		this.focusPaletteView(leaf);
	}

	async openNewPaletteView(
		initialInput = this.getRememberedPaletteQuery("file"),
		fixedMode?: FixedPaletteMode,
		sourcePath?: string,
		sourcePinned = false,
		tableState?: PaletteTableState,
		viewType: PaletteViewType = PALETTE_VIEW_TYPE,
	): Promise<void> {
		// Why: duplicating a table needs a fresh center tab, while list palettes
		// keep independent right-sidebar panes for simultaneous searches.
		const leaf =
			viewType === PALETTE_TABLE_VIEW_TYPE
				? this.app.workspace.getLeaf("tab")
				: this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: viewType,
			active: true,
			// A duplicated palette starts with the same presentation, then persists
			// its own sort state independently from the original pane.
			state: {
				...this.paletteViewState(initialInput, fixedMode, sourcePath, sourcePinned),
				...tableState,
			},
		});
		await this.app.workspace.revealLeaf(leaf);
		this.focusPaletteView(leaf);
	}

	private paletteViewState(
		initialInput: string,
		fixedMode?: FixedPaletteMode,
		sourcePath?: string,
		sourcePinned = false,
	): {
		input: string;
		fixedMode?: typeof fixedMode;
		sourcePath?: string;
		sourcePinned: boolean;
	} {
		return {
			input: initialInput,
			fixedMode,
			sourcePath: sourcePinned ? sourcePath : undefined,
			sourcePinned,
		};
	}

	private focusPaletteView(leaf: WorkspaceLeaf): void {
		// Focus is explicit for command-created views; restored views must not steal
		// focus from the editor merely because Obsidian reopened their ItemView.
		if (leaf.view instanceof PaletteView) leaf.view.focusSearchInput();
	}

	releasePaletteModal(modal: PaletteModal): void {
		if (this.activePaletteModal === modal) this.activePaletteModal = undefined;
	}

	async openExternalMarkdown(
		absolutePath: string,
		action: LeafOpenAction,
		autoFocus = true,
		active = true,
		targetLeaf?: WorkspaceLeaf,
		reuseExisting = true,
	): Promise<void> {
		// Why: main-window new-tab actions intentionally bypass existing external tabs.
		await openExternalMarkdown(
			this,
			absolutePath,
			action,
			autoFocus,
			active,
			targetLeaf,
			reuseExisting,
		);
	}

	onunload(): void {
		this.activePaletteModal?.close();
		this.activePaletteModal = undefined;
		this.everythingClient.cancel();
		this.paletteDisplaySettings.dispose();
		this.fileProvider?.dispose();
		void this.searchHistory?.dispose();
		void this.recentCommands?.dispose();
		void this.recentTagStore?.dispose();
		void this.fileUsageHistory?.dispose();
		logger.debug("Plugin unloaded");
	}

	initializeLogger(): void {
		logger.level = this.settings.showLog ? LogLevels.debug : LogLevels.error;
	}

	async loadSettings(): Promise<LoadedPluginSettings> {
		return loadPluginSettings(this);
	}

	async saveSettings(): Promise<void> {
		await savePluginSettings(
			this,
			this.searchHistory?.getLegacyEntries(),
			this.recentCommands?.getLegacyIds(),
		);
	}

	async testEverythingConnection(): Promise<{ ok: boolean; message: string }> {
		try {
			await this.everythingClient.search(
				"__my_palette_connection_test__",
				this.settings.everything,
				undefined,
				1,
			);
			return { ok: true, message: "Everything connection succeeded." };
		} catch (error) {
			return { ok: false, message: error instanceof Error ? error.message : String(error) };
		}
	}

	recordCommand(id: string): void {
		this.recentCommands?.record(id);
	}

	recordFileUsage(path: string): void {
		this.fileUsageHistory?.record(path);
	}

	recordResultUsage(result: PaletteResult): void {
		const path = getResultFilePath(result);
		if (path) this.recordFileUsage(path);
	}

	rememberPaletteQuery(mode: PaletteMode, query: string, rawInput?: string): void {
		if (!this.settings.rememberLastInput) return;
		// なぜfileだけrawInputか: fileの再開入力はプレフィックス込みの生入力を
		// そのまま使うため(i fooなど)。commandは呼び出し側でプレフィックスを
		// 付与して復元するのでqueryのままにする。
		this.rememberedPaletteQueries[mode] =
			mode === "file" && rawInput !== undefined ? rawInput : query;
		if (mode === "everything" && rawInput !== undefined)
			this.rememberedPaletteQueries.file = rawInput;
	}

	getSearchHistorySuggestions(
		input: string,
		category: SearchHistoryCategory,
		includeIgnored = false,
	): SearchHistoryResult[] {
		const entries = this.searchHistory?.getSuggestions(input, category, includeIgnored) ?? [];
		return entries.map((entry) => ({
			id: `search-history:${entry.category}:${entry.input}`,
			mode: "search-history",
			primary: entry.input,
			secondary: "Search history",
			icon: "history",
			...entry,
		}));
	}

	formatSearchHistoryInput(entry: SearchHistoryEntry): string {
		return formatSearchHistoryInput(entry, this.settings.prefixes);
	}

	recordSearch(input: string, category: SearchHistoryCategory, includeIgnored = false): void {
		const history = this.settings.searchHistory;
		if (!history.enabled || !input.trim()) return;
		const options = {
			now: Date.now(),
			daysToKeep: history.daysToKeep,
			maxEntries: SEARCH_HISTORY_MAX_ENTRIES,
			includeIgnored,
		};
		this.searchHistory?.record(input, category, options);
	}

	clearSearchHistory(): void {
		this.searchHistory?.clear();
	}

	clearRememberedPaletteQueries(): void {
		this.rememberedPaletteQueries = {};
	}

	getRememberedPaletteQuery(mode: PaletteMode): string {
		if (!this.settings.rememberLastInput) return "";
		return this.rememberedPaletteQueries[mode] ?? "";
	}

	commandPaletteInitialInput(): string {
		const prefix = this.settings.prefixes.command.trimEnd();
		const query = this.getRememberedPaletteQuery("command");
		return `${prefix} ${query}`;
	}

	openSettings(): void {
		const setting = (
			this.app as unknown as {
				setting: { open: () => void; openTabById: (id: string) => void };
			}
		).setting;
		setting.open();
		setting.openTabById(this.manifest.id);
	}
}
