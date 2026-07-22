import { Plugin } from "obsidian";
import log, { LogLevels } from "consola";
import { DEFAULT_SETTINGS, mergeSettings, MyPaletteSettingTab } from "./settings";
import type { MyPaletteSettings } from "./model/settings";
import { PaletteModal } from "./palette/PaletteModal";
import { EverythingHttpClient } from "./everything/EverythingHttpClient";
import { FileProvider } from "./providers/FileProvider";
import { CommandProvider } from "./providers/CommandProvider";
import { EverythingProvider } from "./providers/EverythingProvider";
import { RelatedFileProvider } from "./providers/RelatedFileProvider";
import { BookmarkProvider } from "./providers/BookmarkProvider";
import { SmartConnectionProvider } from "./providers/SmartConnectionProvider";
import type { PaletteMode } from "./model/results";
import type { PaletteProvider } from "./providers/PaletteProvider";
import { MoveFileModal } from "./palette/MoveFileModal";
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

	async onload(): Promise<void> {
		await this.loadSettings();
		this.initializeLogger();
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
			callback: () => new PaletteModal(this.app, this).open(),
		});
		this.addCommand({
			id: "open-command-list",
			name: "Open command list",
			callback: () =>
				new PaletteModal(
					this.app,
					this,
					`${this.settings.prefixes.command.trimEnd()} `,
				).open(),
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
