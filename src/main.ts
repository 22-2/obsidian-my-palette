import { Plugin, type WorkspaceLeaf } from "obsidian";
import log, { LogLevels } from "consola";
import { DEFAULT_SETTINGS, mergeSettings, MyPaletteSettingTab } from "src/settings";
import type { MyPaletteSettings } from "src/model/settings";
import { PaletteModal } from "src/palette/PaletteModal";
import { EverythingHttpClient } from "src/everything/EverythingHttpClient";
import { FileProvider } from "src/providers/FileProvider";
import { CommandProvider } from "src/providers/CommandProvider";
import { EverythingProvider } from "src/providers/EverythingProvider";
import { RelatedFileProvider } from "src/providers/RelatedFileProvider";
import { BookmarkProvider } from "src/providers/BookmarkProvider";
import { SmartConnectionProvider } from "src/providers/SmartConnectionProvider";
import type { PaletteMode, SearchHistoryResult } from "src/model/results";
import type { SearchHistoryEntry } from "src/model/settings";
import type { PaletteProvider } from "src/providers/PaletteProvider";
import { MoveFileModal } from "src/palette/MoveFileModal";
import { insertLinkToMocRelateds } from "src/commands/mocRelateds";
import { EXTERNAL_MARKDOWN_VIEW_TYPE, ExternalMarkdownView } from "src/views/ExternalMarkdownView";
import {
	getSearchHistorySuggestions,
	pruneStoredSearchHistory,
	recordSearchHistory,
} from "src/core/searchHistory";
import "../styles.css";

const logger = log.withTag("MyPalette");

export default class MyPalettePlugin extends Plugin {
	settings: MyPaletteSettings = DEFAULT_SETTINGS;
	readonly everythingClient = new EverythingHttpClient((message, detail) =>
		logger.debug(message, detail),
	);
	fileProvider!: FileProvider;
	commandProvider!: CommandProvider;
	everythingProvider!: EverythingProvider;
	relatedFileProvider!: RelatedFileProvider;
	bookmarkProvider!: BookmarkProvider;
	smartConnectionProvider!: SmartConnectionProvider;
	providers!: Record<PaletteMode, PaletteProvider>;
	private rememberedPaletteQueries: Partial<Record<PaletteMode, string>> = {};

	async onload(): Promise<void> {
		await this.loadSettings();
		this.initializeLogger();
		this.registerView(EXTERNAL_MARKDOWN_VIEW_TYPE, (leaf) => new ExternalMarkdownView(leaf));
		this.fileProvider = new FileProvider(
			this.app,
			() => this.settings.everything.vaultExtensions,
		);
		this.commandProvider = new CommandProvider(this.app, () => this.settings.recentCommandIds);
		this.everythingProvider = new EverythingProvider(
			this.app,
			this.everythingClient,
			() => this.settings.everything,
		);
		this.relatedFileProvider = new RelatedFileProvider(this.app);
		this.bookmarkProvider = new BookmarkProvider(this.app);
		this.smartConnectionProvider = new SmartConnectionProvider(this.app);
		this.providers = {
			file: this.fileProvider,
			command: this.commandProvider,
			everything: this.everythingProvider,
			link: this.relatedFileProvider,
			backlink: this.relatedFileProvider,
			bookmark: this.bookmarkProvider,
			smart: this.smartConnectionProvider,
		};
		this.addSettingTab(new MyPaletteSettingTab(this));
		this.addCommand({
			id: "open",
			name: "Open Recent palette",
			callback: () =>
				new PaletteModal(this.app, this, this.getRememberedPaletteQuery("file")).open(),
		});
		this.addCommand({
			id: "open-command-list",
			name: "Open command list",
			callback: () =>
				new PaletteModal(this.app, this, this.commandPaletteInitialInput()).open(),
		});
		this.addCommand({
			id: "link-search",
			name: "Link search",
			checkCallback: (checking) => {
				if (checking) return Boolean(this.app.workspace.getActiveFile());
				new PaletteModal(this.app, this, "", "link").open();
			},
		});
		this.addCommand({
			id: "backlink-search",
			name: "Backlink search",
			checkCallback: (checking) => {
				if (checking) return Boolean(this.app.workspace.getActiveFile());
				new PaletteModal(this.app, this, "", "backlink").open();
			},
		});
		this.addCommand({
			id: "bookmark-search",
			name: "Bookmark search",
			callback: () => new PaletteModal(this.app, this, "", "bookmark").open(),
		});
		this.addCommand({
			id: "smart-connections-search",
			name: "Smart Connections search",
			checkCallback: (checking) => {
				if (checking) return Boolean(this.app.workspace.getActiveFile());
				new PaletteModal(this.app, this, "", "smart").open();
			},
		});
		this.addCommand({
			id: "move-file-to-another-folder",
			name: "Move file to another folder",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (checking) return Boolean(file);
				if (file) new MoveFileModal(this.app, file).open();
			},
		});
		this.addCommand({
			id: "insert-link-to-moc-relateds",
			name: "Insert link to MOC Relateds",
			checkCallback: (checking) => {
				const canRun = Boolean(this.app.workspace.getActiveFile());
				if (checking) return canRun;
				void insertLinkToMocRelateds(this);
			},
		});
	}

	async openExternalMarkdown(
		absolutePath: string,
		action: "primary" | "alternate" | "tertiary",
		autoFocus = true,
	): Promise<void> {
		const externalLeaves = this.app.workspace.getLeavesOfType(EXTERNAL_MARKDOWN_VIEW_TYPE);
		const existing = externalLeaves.find(
			(leaf) =>
				leaf.view instanceof ExternalMarkdownView &&
				leaf.view.getFilePath().toLocaleLowerCase() === absolutePath.toLocaleLowerCase(),
		);
		if (existing) {
			await existing.setViewState({
				type: EXTERNAL_MARKDOWN_VIEW_TYPE,
				active: true,
				state: { path: absolutePath, autoFocus, preview: !autoFocus },
			});
			this.app.workspace.revealLeaf(existing);
			return;
		}
		const previewLeaf = !autoFocus
			? externalLeaves.find(
					(leaf) => leaf.view instanceof ExternalMarkdownView && leaf.view.isPreview(),
				)
			: undefined;
		const leaf: WorkspaceLeaf =
			previewLeaf ??
			(action === "alternate"
				? this.app.workspace.getLeaf("tab")
				: action === "tertiary"
					? this.app.workspace.getLeaf("split", "vertical")
					: this.app.workspace.getLeaf(false));
		await leaf.setViewState({
			type: EXTERNAL_MARKDOWN_VIEW_TYPE,
			active: true,
			state: { path: absolutePath, autoFocus, preview: !autoFocus },
		});
		this.app.workspace.revealLeaf(leaf);
	}

	onunload(): void {
		this.everythingClient.cancel();
		this.fileProvider?.dispose();
		logger.debug("Plugin unloaded");
	}

	initializeLogger(): void {
		logger.level = this.settings.showLog ? LogLevels.debug : LogLevels.error;
	}

	async loadSettings(): Promise<void> {
		this.settings = mergeSettings(await this.loadData());
		this.settings.searchHistory.entries = pruneStoredSearchHistory(
			this.settings.searchHistory.entries,
			Date.now(),
			this.settings.searchHistory.daysToKeep,
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
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
		].slice(0, 20);
		void this.saveSettings();
	}

	rememberPaletteQuery(mode: PaletteMode, query: string, rawInput?: string): void {
		if (!this.settings.rememberLastInput) return;
		this.rememberedPaletteQueries[mode] = query;
		if (mode === "everything" && rawInput !== undefined)
			this.rememberedPaletteQueries.file = rawInput;
	}

	getSearchHistorySuggestions(input: string): SearchHistoryResult[] {
		return getSearchHistorySuggestions(this.settings.searchHistory.entries, input).map(
			(entry) => ({
				id: `search-history:${entry.input}`,
				mode: "search-history",
				primary: entry.input,
				secondary: "Search history",
				icon: "history",
				...entry,
			}),
		);
	}

	formatSearchHistoryInput(entry: SearchHistoryEntry): string {
		return entry.input;
	}

	recordSearch(input: string): void {
		const history = this.settings.searchHistory;
		if (!history.enabled || !input.trim()) return;
		history.entries = recordSearchHistory(history.entries, input, {
			now: Date.now(),
			daysToKeep: history.daysToKeep,
			maxEntries: 256,
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

	private getRememberedPaletteQuery(mode: PaletteMode): string {
		if (!this.settings.rememberLastInput) return "";
		return this.rememberedPaletteQueries[mode] ?? "";
	}

	private commandPaletteInitialInput(): string {
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
