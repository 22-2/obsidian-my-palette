import { Plugin, type WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, MyPaletteSettingTab } from "src/settings";
import type { LeafOpenAction } from "src/workspace/openLeaf";
import type { MyPaletteSettings } from "src/settings/model";
import {
	createPaletteProviders,
	type PaletteProviderInstances,
} from "src/app/createPaletteProviders";
import { PaletteOpener } from "src/app/paletteOpener";
import { registerCli } from "src/app/registerCli";
import { registerPluginCommands } from "src/app/registerCommands";
import { registerPluginEvents } from "src/app/registerEvents";
import { openExternalMarkdown } from "src/workspace/external-markdown/openExternalMarkdown";
import { EverythingClient } from "src/search/everything/EverythingClient";
import {
	getResultFilePath,
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
import { IntegrationAvailability } from "src/app/integrationAvailability";
import { getVaultRootPath } from "src/ignored-notes/ignoredPaths";
import { openPluginSettings } from "src/search/plugin/pluginSettings";
import "../styles.css";
import { ICONS } from "src/ui/icons";
import { debugLog, logger, setDebugLogging } from "src/shared/logger";
import { t } from "src/i18n";

export default class MyPalettePlugin extends Plugin {
	settings: MyPaletteSettings = DEFAULT_SETTINGS;
	readonly paletteDisplaySettings = new PaletteDisplaySettingsStore(
		() => this.settings,
		() => this.saveSettings(),
	);
	readonly everythingClient = new EverythingClient(debugLog);
	readonly integrationAvailability = new IntegrationAvailability(
		() => this.settings,
		async (settings, signal) => {
			try {
				if (!getVaultRootPath(this.app)) throw new Error(t("everything.noVaultFolder"));
				await this.everythingClient.search(
					"__my_palette_connection_test__",
					settings,
					signal,
					1,
				);
				return { ok: true, message: t("everything.connectionOk") };
			} catch (error) {
				return {
					ok: false,
					message: error instanceof Error ? error.message : String(error),
				};
			}
		},
		() => this.smartConnectionProvider?.isReady() ?? false,
	);
	fileProvider!: PaletteProviderInstances["fileProvider"];
	commandProvider!: PaletteProviderInstances["commandProvider"];
	everythingProvider!: PaletteProviderInstances["everythingProvider"];
	relatedFileProvider!: PaletteProviderInstances["relatedFileProvider"];
	bookmarkProvider!: PaletteProviderInstances["bookmarkProvider"];
	smartConnectionProvider!: PaletteProviderInstances["smartConnectionProvider"];
	tabProvider!: PaletteProviderInstances["tabProvider"];
	pluginProvider!: PaletteProviderInstances["pluginProvider"];
	snippetProvider!: PaletteProviderInstances["snippetProvider"];
	auditProvider!: PaletteProviderInstances["auditProvider"];
	providers!: PaletteProviderInstances["providers"];
	private fileUsageHistory?: FileUsageHistory;
	private searchHistory?: SearchHistoryService;
	private recentCommands?: RecentCommandService;
	recentTagStore!: RecentTagStore;
	readonly paletteOpener = new PaletteOpener(this.app, this);

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
		// 最近使ったタグは data.json に保存されたことがないので、移行するものはない。
		await this.recentTagStore.load();
		this.fileUsageHistory = new FileUsageHistory(this.app, debugLog);
		await this.fileUsageHistory.load();
		registerPluginEvents(this);
		const providers = createPaletteProviders(this.app, this.everythingClient, {
			vaultExtensions: () => this.settings.everything.vaultExtensions,
			fileSortPriorities: () => this.settings.file.sortPriorities,
			excludedFolders: () => this.settings.file.excludedFolders,
			demotedPriorFolders: () => this.settings.file.demotedPriorFolders,
			foldKana: () => this.settings.file.foldKana,
			openableFilesOnly: () => this.settings.file.openableFilesOnly,
			recentCommandIds: () => this.recentCommands?.getIds() ?? [],
			everythingSettings: () => this.settings.everything,
			settings: () => this.settings,
			fileUsageHistory: this.fileUsageHistory,
			log: debugLog,
		});
		this.fileProvider = providers.fileProvider;
		this.commandProvider = providers.commandProvider;
		this.everythingProvider = providers.everythingProvider;
		this.relatedFileProvider = providers.relatedFileProvider;
		this.bookmarkProvider = providers.bookmarkProvider;
		this.smartConnectionProvider = providers.smartConnectionProvider;
		this.tabProvider = providers.tabProvider;
		this.pluginProvider = providers.pluginProvider;
		this.snippetProvider = providers.snippetProvider;
		this.auditProvider = providers.auditProvider;
		this.providers = providers.providers;
		this.addSettingTab(new MyPaletteSettingTab(this));
		registerPluginCommands(this);
		registerCli(this);
		void this.integrationAvailability.refresh();
	}

	async openExternalMarkdown(
		absolutePath: string,
		action: LeafOpenAction,
		autoFocus = true,
		active = true,
		targetLeaf?: WorkspaceLeaf,
		reuseExisting = true,
	): Promise<void> {
		// Why: メインウィンドウで新しいタブを開く操作は、既存の外部のタブを意図的に迂回する。
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
		this.paletteOpener.closeModal();
		this.everythingClient.cancel();
		this.integrationAvailability.dispose();
		this.paletteDisplaySettings.dispose();
		this.fileProvider?.dispose();
		this.auditProvider?.dispose();
		void this.searchHistory?.dispose();
		void this.recentCommands?.dispose();
		void this.recentTagStore?.dispose();
		void this.fileUsageHistory?.dispose();
		logger.debug("Plugin unloaded");
	}

	initializeLogger(): void {
		setDebugLogging(this.settings.showLog);
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
		void this.integrationAvailability.refresh();
	}

	async testEverythingConnection(): Promise<{ ok: boolean; message: string }> {
		return this.integrationAvailability.refresh(true);
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
			secondary: t("history.label"),
			icon: ICONS.history,
			...entry,
		}));
	}

	formatSearchHistoryInput(entry: SearchHistoryEntry): string {
		return formatSearchHistoryInput(entry, this.settings.modes);
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

	clearSearchHistoryCategories(categories: readonly SearchHistoryCategory[]): void {
		this.searchHistory?.clearCategories(categories);
	}

	openSettings(): void {
		openPluginSettings(this.app, this.manifest.id);
	}
}
