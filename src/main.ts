import { Plugin } from "obsidian";
import log, { LogLevels } from "consola";
import { DEFAULT_SETTINGS, MyPaletteSettingTab } from "src/settings";
import { MAX_RECENT_COMMAND_IDS, type MyPaletteSettings } from "src/model/settings";
import {
	createPaletteProviders,
	type PaletteProviderInstances,
} from "src/app/createPaletteProviders";
import { registerPluginCommands } from "src/app/registerCommands";
import { registerPluginEvents } from "src/app/registerEvents";
import { openExternalMarkdown } from "src/app/openExternalMarkdown";
import { PaletteModal } from "src/palette/PaletteModal";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";
import type { PaletteMode, SearchHistoryResult } from "src/model/results";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/model/settings";
import { getSearchHistorySuggestions, recordSearchHistory } from "src/palette/searchHistory";
import { loadPluginSettings, savePluginSettings } from "src/settings/settingsStore";
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
	private rememberedPaletteQueries: Partial<Record<PaletteMode, string>> = {};
	private activePaletteModal?: PaletteModal;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.initializeLogger();
		registerPluginEvents(this);
		const providers = createPaletteProviders(this.app, this.everythingClient, {
			vaultExtensions: () => this.settings.everything.vaultExtensions,
			fileSortPriorities: () => this.settings.file.sortPriorities,
			recentCommandIds: () => this.settings.recentCommandIds,
			everythingSettings: () => this.settings.everything,
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
		logger.debug("Plugin unloaded");
	}

	initializeLogger(): void {
		logger.level = this.settings.showLog ? LogLevels.debug : LogLevels.error;
	}

	async loadSettings(): Promise<void> {
		await loadPluginSettings(this);
	}

	async saveSettings(): Promise<void> {
		await savePluginSettings(this);
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
		this.settings.recentCommandIds = [
			id,
			...this.settings.recentCommandIds.filter((existing) => existing !== id),
		].slice(0, MAX_RECENT_COMMAND_IDS);
		void this.saveSettings();
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
		return getSearchHistorySuggestions(
			this.settings.searchHistory.entries,
			input,
			category,
			30,
			includeIgnored,
		).map((entry) => ({
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
					? `b ${entry.input}`
					: entry.category === "smart"
						? `sc ${entry.input}`
						: entry.category === "everything"
							? `${this.settings.prefixes.everything.trimEnd()} ${entry.input}`
							: entry.category === "everything-directory"
								? `esdir ${entry.input}`
								: entry.input;
		return entry.includeIgnored
			? `${this.settings.prefixes.includeIgnored.trimEnd()} ${modeInput}`
			: modeInput;
	}

	recordSearch(input: string, category: SearchHistoryCategory, includeIgnored = false): void {
		const history = this.settings.searchHistory;
		if (!history.enabled || !input.trim()) return;
		history.entries = recordSearchHistory(history.entries, input, category, {
			now: Date.now(),
			daysToKeep: history.daysToKeep,
			maxEntries: 256,
			includeIgnored,
		});
		void this.saveSettings();
	}

	clearSearchHistory(): void {
		this.settings.searchHistory.entries = [];
		void this.saveSettings();
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
