import { Plugin, type WorkspaceLeaf } from "obsidian";
import log, { LogLevels } from "consola";
import { DEFAULT_SETTINGS, MyPaletteSettingTab } from "src/settings";
import type { MyPaletteSettings } from "src/model/settings";
import {
	createPaletteProviders,
	type PaletteProviderInstances,
} from "src/app/createPaletteProviders";
import { registerPluginCommands } from "src/app/registerCommands";
import { registerPluginEvents } from "src/app/registerEvents";
import { openExternalMarkdown } from "src/app/openExternalMarkdown";
import { PaletteModal } from "src/palette/PaletteModal";
import { PALETTE_VIEW_TYPE, PaletteView } from "src/views/PaletteView";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";
import type { PaletteMode, PaletteResult, SearchHistoryResult } from "src/model/results";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/model/settings";
import {
	getSearchHistorySuggestions,
	recordSearchHistory,
	SEARCH_HISTORY_MAX_ENTRIES,
} from "src/palette/searchHistory";
import { RELATED_PREFIXES } from "src/palette/inputParser";
import {
	loadPluginSettings,
	savePluginSettings,
	type LoadedPluginSettings,
} from "src/settings/settingsStore";
import { FileUsageHistory } from "src/search/file/fileUsageHistory";
import {
	normalizeRecentCommandIds,
	RecentCommandStore,
} from "src/search/command/recentCommandStore";
import { SearchHistoryStore } from "src/palette/searchHistoryStore";
import "../styles.css";

const logger = log.withTag("MyPalette");

export default class MyPalettePlugin extends Plugin {
	settings: MyPaletteSettings = DEFAULT_SETTINGS;
	readonly everythingClient = new EverythingHttpClient((message, detail) =>
		logger.debug(message, detail),
	);
	fileProvider!: PaletteProviderInstances["fileProvider"];
	commandProvider!: PaletteProviderInstances["commandProvider"];
	everythingProvider!: PaletteProviderInstances["everythingProvider"];
	relatedFileProvider!: PaletteProviderInstances["relatedFileProvider"];
	bookmarkProvider!: PaletteProviderInstances["bookmarkProvider"];
	smartConnectionProvider!: PaletteProviderInstances["smartConnectionProvider"];
	providers!: PaletteProviderInstances["providers"];
	private fileUsageHistory?: FileUsageHistory;
	private searchHistoryStore?: SearchHistoryStore;
	private recentCommandStore?: RecentCommandStore;
	private legacySearchHistoryEntries?: SearchHistoryEntry[];
	private legacyRecentCommandIds?: string[];
	private rememberedPaletteQueries: Partial<Record<PaletteMode, string>> = {};
	private activePaletteModal?: PaletteModal;

	async onload(): Promise<void> {
		const loadedSettings = await this.loadSettings();
		this.initializeLogger();
		this.searchHistoryStore = new SearchHistoryStore(this.app, (message, detail) =>
			logger.debug(message, detail),
		);
		const persistentHistory = await this.searchHistoryStore.load(
			loadedSettings.legacySearchHistoryEntries,
			this.settings.searchHistory.daysToKeep,
		);
		// Keep the legacy payload in data.json only when IndexedDB cannot accept
		// the migration, so a later settings save cannot erase search history.
		this.legacySearchHistoryEntries = persistentHistory
			? undefined
			: [...this.searchHistoryStore.getEntries()];
		this.recentCommandStore = new RecentCommandStore(this.app, (message, detail) =>
			logger.debug(message, detail),
		);
		const persistentRecentCommands = await this.recentCommandStore.load(
			loadedSettings.legacyRecentCommandIds,
		);
		this.legacyRecentCommandIds = persistentRecentCommands
			? undefined
			: [...this.recentCommandStore.getIds()];
		if (loadedSettings.shouldSave) await this.saveSettings();
		this.fileUsageHistory = new FileUsageHistory(this.app, (message, detail) =>
			logger.debug(message, detail),
		);
		await this.fileUsageHistory.load();
		registerPluginEvents(this);
		const providers = createPaletteProviders(this.app, this.everythingClient, {
			vaultExtensions: () => this.settings.everything.vaultExtensions,
			fileSortPriorities: () => this.settings.file.sortPriorities,
			excludedFolders: () => this.settings.file.excludedFolders,
			recentCommandIds: () =>
				this.recentCommandStore
					? [...this.recentCommandStore.getIds()]
					: (this.legacyRecentCommandIds ?? []),
			everythingSettings: () => this.settings.everything,
			fileUsageHistory: this.fileUsageHistory,
			log: (message, detail) => logger.debug(message, detail),
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

	openPalette(
		initialInput = "",
		fixedMode?: Extract<PaletteMode, "link" | "backlink" | "bookmark" | "smart">,
	): void {
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
		fixedMode?: Extract<PaletteMode, "link" | "backlink" | "bookmark" | "smart">,
	): Promise<void> {
		const leaf = await this.app.workspace.ensureSideLeaf(PALETTE_VIEW_TYPE, "right", {
			active: true,
			reveal: true,
			state: this.paletteViewState(initialInput, fixedMode),
		});
		this.focusPaletteView(leaf);
	}

	async openNewPaletteView(
		initialInput = this.getRememberedPaletteQuery("file"),
		fixedMode?: Extract<PaletteMode, "link" | "backlink" | "bookmark" | "smart">,
		sourcePath?: string,
	): Promise<void> {
		// ensureSideLeaf intentionally reuses a view of the same type. A separate
		// right-sidebar leaf is required here so users can keep independent searches
		// open at the same time.
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		await leaf.setViewState({
			type: PALETTE_VIEW_TYPE,
			active: true,
			state: this.paletteViewState(initialInput, fixedMode, sourcePath),
		});
		this.app.workspace.revealLeaf(leaf);
		this.focusPaletteView(leaf);
	}

	private paletteViewState(
		initialInput: string,
		fixedMode?: Extract<PaletteMode, "link" | "backlink" | "bookmark" | "smart">,
		sourcePath = this.currentPaletteSourcePath(),
	): { input: string; fixedMode?: typeof fixedMode; sourcePath?: string } {
		return {
			input: initialInput,
			fixedMode,
			sourcePath,
		};
	}

	private currentPaletteSourcePath(): string | undefined {
		const sourcePath =
			this.app.workspace.getActiveFile()?.path ??
			(
				this.app.workspace.getMostRecentLeaf(this.app.workspace.rootSplit)?.view as
					| {
							file?: { path?: unknown };
					  }
					| undefined
			)?.file?.path;
		return typeof sourcePath === "string" ? sourcePath : undefined;
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
		action: "primary" | "alternate" | "vertical" | "horizontal",
		autoFocus = true,
		active = true,
	): Promise<void> {
		await openExternalMarkdown(this, absolutePath, action, autoFocus, active);
	}

	onunload(): void {
		this.activePaletteModal?.close();
		this.activePaletteModal = undefined;
		this.everythingClient.cancel();
		this.fileProvider?.dispose();
		void this.searchHistoryStore?.dispose();
		void this.recentCommandStore?.dispose();
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
			this.legacySearchHistoryEntries,
			this.legacyRecentCommandIds,
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
		if (this.recentCommandStore) {
			this.recentCommandStore.record(id);
			this.syncLegacyRecentCommandFallback();
		} else {
			this.legacyRecentCommandIds = normalizeRecentCommandIds([
				id,
				...(this.legacyRecentCommandIds ?? []),
			]);
		}
		if (this.legacyRecentCommandIds !== undefined) void this.saveSettings();
	}

	recordFileUsage(path: string): void {
		this.fileUsageHistory?.record(path);
	}

	recordResultUsage(result: PaletteResult): void {
		const path =
			result.mode === "file"
				? result.vaultPath
				: result.mode === "everything" && result.kind === "file"
					? result.vaultPath
					: result.mode === "bookmark"
						? result.file?.path
						: result.mode === "link" ||
							  result.mode === "backlink" ||
							  result.mode === "smart"
							? result.file.path
							: undefined;
		if (path) this.recordFileUsage(path);
	}

	rememberPaletteQuery(mode: PaletteMode, query: string, rawInput?: string): void {
		if (!this.settings.rememberLastInput) return;
		this.rememberedPaletteQueries[mode] = query;
		if (mode === "everything" && rawInput !== undefined)
			this.rememberedPaletteQueries.file = rawInput;
	}

	getSearchHistorySuggestions(
		input: string,
		category: SearchHistoryCategory,
		includeIgnored = false,
	): SearchHistoryResult[] {
		const entries =
			this.searchHistoryStore?.getSuggestions(input, category, 30, includeIgnored) ??
			getSearchHistorySuggestions(
				this.legacySearchHistoryEntries ?? [],
				input,
				category,
				30,
				includeIgnored,
			);
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
		const modeInput =
			entry.category === "command"
				? `${this.settings.prefixes.command.trimEnd()} ${entry.input}`
				: entry.category === "bookmark"
					? `bk ${entry.input}`
					: entry.category === "smart"
						? `sc ${entry.input}`
						: entry.category === "everything"
							? `${this.settings.prefixes.everything.trimEnd()} ${entry.input}`
							: entry.category === "everything-directory"
								? `esdir ${entry.input}`
								: entry.category === "link"
									? `${RELATED_PREFIXES.link}${entry.input}`
									: entry.category === "backlink"
										? `${RELATED_PREFIXES.backlink}${entry.input}`
										: entry.input;
		// Related searches intentionally do not support the ignored-note scope;
		// avoid reconstructing an input that the parser would interpret as File mode.
		return entry.includeIgnored && entry.category !== "link" && entry.category !== "backlink"
			? `${this.settings.prefixes.includeIgnored.trimEnd()} ${modeInput}`
			: modeInput;
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
		if (this.searchHistoryStore) {
			this.searchHistoryStore.record(input, category, options);
			this.syncLegacySearchHistoryFallback();
		} else {
			this.legacySearchHistoryEntries = recordSearchHistory(
				this.legacySearchHistoryEntries ?? [],
				input,
				category,
				options,
			);
		}
		if (this.legacySearchHistoryEntries !== undefined) void this.saveSettings();
	}

	clearSearchHistory(): void {
		if (this.searchHistoryStore) {
			this.searchHistoryStore.clear();
			this.syncLegacySearchHistoryFallback();
		} else {
			this.legacySearchHistoryEntries = [];
		}
		if (this.legacySearchHistoryEntries !== undefined) void this.saveSettings();
	}

	private syncLegacySearchHistoryFallback(): void {
		if (this.searchHistoryStore && !this.searchHistoryStore.isPersistent)
			this.legacySearchHistoryEntries = [...this.searchHistoryStore.getEntries()];
	}

	private syncLegacyRecentCommandFallback(): void {
		if (this.recentCommandStore && !this.recentCommandStore.isPersistent)
			this.legacyRecentCommandIds = [...this.recentCommandStore.getIds()];
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
