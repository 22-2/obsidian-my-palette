import { Plugin, type WorkspaceLeaf } from "obsidian";
import log, { LogLevels } from "consola";
import { DEFAULT_SETTINGS, MyPaletteSettingTab } from "src/settings";
import type { LeafOpenAction } from "src/workspace/openLeaf";
import type { MyPaletteSettings } from "src/settings/model";
import {
	createPaletteProviders,
	type PaletteProviderInstances,
} from "src/app/createPaletteProviders";
import { PaletteOpener } from "src/app/paletteOpener";
import { registerPluginCommands } from "src/app/registerCommands";
import { registerPluginEvents } from "src/app/registerEvents";
import { openExternalMarkdown } from "src/workspace/external-markdown/openExternalMarkdown";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";
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
		this.paletteOpener.closeModal();
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
