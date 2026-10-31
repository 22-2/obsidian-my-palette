import type { App } from "obsidian";
import type { FileSortPriorities, MyPaletteSettings } from "src/settings/model";
import type { PaletteMode } from "src/palette/results";
import { EverythingClient } from "src/search/everything/EverythingClient";
import { EverythingProvider } from "src/search/everything/EverythingProvider";
import { FileProvider } from "src/search/file/FileProvider";
import { CommandProvider } from "src/search/command/CommandProvider";
import { RelatedFileProvider } from "src/search/related/RelatedFileProvider";
import { HeadingProvider } from "src/search/heading/HeadingProvider";
import { BookmarkProvider } from "src/search/bookmark/BookmarkProvider";
import { SmartConnectionProvider } from "src/search/smart/SmartConnectionProvider";
import { TabProvider } from "src/search/tab/TabProvider";
import { PluginProvider } from "src/search/plugin/PluginProvider";
import { SnippetProvider } from "src/search/snippet/SnippetProvider";
import { TagProvider } from "src/search/tag/TagProvider";
import { PropertyProvider } from "src/search/property/PropertyProvider";
import { AuditProvider } from "src/search/audit/AuditProvider";
import type { PaletteProvider } from "src/search/PaletteProvider";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import type { FileUsageScoreSource } from "src/search/file/fileUsageHistory";

export interface PaletteProviderInstances {
	fileProvider: FileProvider;
	commandProvider: CommandProvider;
	everythingProvider: EverythingProvider;
	relatedFileProvider: RelatedFileProvider;
	bookmarkProvider: BookmarkProvider;
	smartConnectionProvider: SmartConnectionProvider;
	tabProvider: TabProvider;
	pluginProvider: PluginProvider;
	snippetProvider: SnippetProvider;
	tagProvider: TagProvider;
	auditProvider: AuditProvider;
	providers: Record<PaletteMode, PaletteProvider>;
}

interface ProviderFactoryOptions {
	vaultExtensions: () => string[];
	fileSortPriorities: () => FileSortPriorities;
	excludedFolders?: ExcludedFolderSource;
	demotedPriorFolders?: ExcludedFolderSource;
	/** ファイル検索で、ひらがなとカタカナを同じ文字として扱うかどうか。 */
	foldKana?: () => boolean;
	/** Obsidian で開けない拡張子のファイルを、ファイル検索から除くかどうか。 */
	openableFilesOnly?: () => boolean;
	recentCommandIds: () => string[];
	everythingSettings: () => MyPaletteSettings["everything"];
	/** Vault 監査は対象の種類と除外設定を読み、このプラグインの除外フォルダーも使う。 */
	settings: () => MyPaletteSettings;
	fileUsageHistory?: FileUsageScoreSource;
	log: (message: string, detail?: unknown) => void;
}

/**
 * プロバイダーの生成は一か所にまとめる。プラグインのライフサイクルが、
 * モードの登録や依存関係の組み立てまで持たないようにするため。
 */
export function createPaletteProviders(
	app: App,
	everythingClient: EverythingClient,
	options: ProviderFactoryOptions,
): PaletteProviderInstances {
	const excludedFolders = options.excludedFolders ?? EMPTY_EXCLUDED_FOLDER_SOURCE;
	const fileProvider = new FileProvider(
		app,
		options.vaultExtensions,
		options.log,
		options.fileSortPriorities,
		options.fileUsageHistory,
		excludedFolders,
		options.demotedPriorFolders,
		options.foldKana,
		options.openableFilesOnly,
	);
	const commandProvider = new CommandProvider(app, options.recentCommandIds);
	const everythingProvider = new EverythingProvider(
		app,
		everythingClient,
		options.everythingSettings,
		excludedFolders,
		options.openableFilesOnly,
	);
	const relatedFileProvider = new RelatedFileProvider(app, excludedFolders);
	const bookmarkProvider = new BookmarkProvider(app, excludedFolders);
	const smartConnectionProvider = new SmartConnectionProvider(app, excludedFolders);
	const tabProvider = new TabProvider(app);
	const pluginProvider = new PluginProvider(app);
	const snippetProvider = new SnippetProvider(app);
	const tagProvider = new TagProvider(app);
	const auditProvider = new AuditProvider(app, options.settings);
	return {
		fileProvider,
		commandProvider,
		everythingProvider,
		relatedFileProvider,
		bookmarkProvider,
		smartConnectionProvider,
		tabProvider,
		pluginProvider,
		snippetProvider,
		tagProvider,
		auditProvider,
		providers: {
			file: fileProvider,
			command: commandProvider,
			everything: everythingProvider,
			link: relatedFileProvider,
			backlink: relatedFileProvider,
			bookmark: bookmarkProvider,
			smart: smartConnectionProvider,
			tab: tabProvider,
			plugin: pluginProvider,
			snippet: snippetProvider,
			tag: tagProvider,
			property: new PropertyProvider(app),
			heading: new HeadingProvider(app),
			audit: auditProvider,
		},
	};
}
