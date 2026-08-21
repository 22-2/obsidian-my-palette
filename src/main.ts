import { Notice, Plugin, type WorkspaceLeaf } from "obsidian";
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
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/model/settings";
import type { PaletteProvider } from "src/providers/PaletteProvider";
import { MoveFileModal } from "src/palette/MoveFileModal";
import { insertLinkToMocRelateds } from "src/commands/mocRelateds";
import { EXTERNAL_MARKDOWN_VIEW_TYPE, ExternalMarkdownView } from "src/views/ExternalMarkdownView";
import { getVaultFullPath } from "src/core/ignoredPaths";
import { addCopyPathMenuItems, copyPathToClipboard } from "src/core/pathClipboard";
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
	private activePaletteModal?: PaletteModal;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.initializeLogger();
		this.registerView(EXTERNAL_MARKDOWN_VIEW_TYPE, (leaf) => new ExternalMarkdownView(leaf));
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				const absolutePath = getVaultFullPath(this.app, file.path);
				addCopyPathMenuItems(
					menu,
					{ relativePath: file.path, absolutePath: absolutePath ?? undefined },
					(path) => void copyPathToClipboard(path),
				);
			}),
		);
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
			callback: () => this.openPalette(this.getRememberedPaletteQuery("file")),
		});
		this.addCommand({
			id: "open-command-list",
			name: "Open command list",
			callback: () => this.openPalette(this.commandPaletteInitialInput()),
		});
		this.addCommand({
			id: "show-current-line-number",
			name: "Show current line number",
			checkCallback: (checking) => {
				const editor = this.app.workspace.activeEditor?.editor;
				if (checking) return Boolean(editor);
				if (editor) new Notice(`Line ${editor.getCursor().line + 1}`);
			},
		});
		this.addCommand({
			id: "link-search",
			name: "Link search",
			checkCallback: (checking) => {
				if (checking) return Boolean(this.app.workspace.getActiveFile());
				this.openPalette("", "link");
			},
		});
		this.addCommand({
			id: "backlink-search",
			name: "Backlink search",
			checkCallback: (checking) => {
				if (checking) return Boolean(this.app.workspace.getActiveFile());
				this.openPalette("", "backlink");
			},
		});
		this.addCommand({
			id: "bookmark-search",
			name: "Bookmark search",
			callback: () => this.openPalette("", "bookmark"),
		});
		this.addCommand({
			id: "smart-connections-search",
			name: "Smart Connections search",
			checkCallback: (checking) => {
				if (checking) return Boolean(this.app.workspace.getActiveFile());
				this.openPalette("", "smart");
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
		const effectiveAutoFocus = autoFocus && active;
		const externalLeaves = this.app.workspace.getLeavesOfType(EXTERNAL_MARKDOWN_VIEW_TYPE);
		const existing = externalLeaves.find(
			(leaf) =>
				leaf.view instanceof ExternalMarkdownView &&
				leaf.view.getFilePath().toLocaleLowerCase() === absolutePath.toLocaleLowerCase(),
		);
		if (existing) {
			await existing.setViewState({
				type: EXTERNAL_MARKDOWN_VIEW_TYPE,
				active,
				state: {
					path: absolutePath,
					autoFocus: effectiveAutoFocus,
					preview: !autoFocus && active,
				},
			});
			if (active) this.app.workspace.revealLeaf(existing);
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
				: action === "horizontal"
					? this.app.workspace.getLeaf("split", "horizontal")
					: action === "vertical"
						? this.app.workspace.getLeaf("split", "vertical")
						: this.app.workspace.getLeaf(false));
		await leaf.setViewState({
			type: EXTERNAL_MARKDOWN_VIEW_TYPE,
			active,
			state: {
				path: absolutePath,
				autoFocus: effectiveAutoFocus,
				preview: !autoFocus && active,
			},
		});
		if (active) this.app.workspace.revealLeaf(leaf);
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
		const data = await this.loadData();
		this.settings = mergeSettings(data);
		this.settings.searchHistory.entries = pruneStoredSearchHistory(
			this.settings.searchHistory.entries,
			Date.now(),
			this.settings.searchHistory.daysToKeep,
		);
		const storedSchemaVersion =
			data && typeof data === "object" && "schemaVersion" in data
				? (data as { schemaVersion?: unknown }).schemaVersion
				: undefined;
		if (
			typeof storedSchemaVersion === "number" &&
			storedSchemaVersion < this.settings.schemaVersion
		)
			await this.saveSettings();
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

	getSearchHistorySuggestions(
		input: string,
		category: SearchHistoryCategory,
	): SearchHistoryResult[] {
		return getSearchHistorySuggestions(
			this.settings.searchHistory.entries,
			input,
			category,
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
		if (entry.category === "command")
			return `${this.settings.prefixes.command.trimEnd()} ${entry.input}`;
		if (entry.category === "bookmark") return `b ${entry.input}`;
		if (entry.category === "smart") return `sc ${entry.input}`;
		if (entry.category === "everything")
			return `${this.settings.prefixes.everything.trimEnd()} ${entry.input}`;
		if (entry.category === "everything-directory") return `esdir ${entry.input}`;
		return entry.input;
	}

	recordSearch(input: string, category: SearchHistoryCategory): void {
		const history = this.settings.searchHistory;
		if (!history.enabled || !input.trim()) return;
		history.entries = recordSearchHistory(history.entries, input, category, {
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
