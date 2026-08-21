import type { App } from "obsidian";
import type { MyPaletteSettings } from "src/model/settings";
import type { PaletteMode } from "src/model/results";
import { EverythingHttpClient } from "src/search/everything/EverythingHttpClient";
import { EverythingProvider } from "src/search/everything/EverythingProvider";
import { FileProvider } from "src/search/file/FileProvider";
import { CommandProvider } from "src/search/command/CommandProvider";
import { RelatedFileProvider } from "src/search/related/RelatedFileProvider";
import { BookmarkProvider } from "src/search/bookmark/BookmarkProvider";
import { SmartConnectionProvider } from "src/search/smart/SmartConnectionProvider";
import type { PaletteProvider } from "src/search/PaletteProvider";

export interface PaletteProviderInstances {
	fileProvider: FileProvider;
	commandProvider: CommandProvider;
	everythingProvider: EverythingProvider;
	relatedFileProvider: RelatedFileProvider;
	bookmarkProvider: BookmarkProvider;
	smartConnectionProvider: SmartConnectionProvider;
	providers: Record<PaletteMode, PaletteProvider>;
}

interface ProviderFactoryOptions {
	vaultExtensions: () => string[];
	recentCommandIds: () => string[];
	everythingSettings: () => MyPaletteSettings["everything"];
	log: (message: string, detail?: unknown) => void;
}

/**
 * Provider construction is kept in one composition boundary so the Plugin
 * lifecycle does not also own mode registration and dependency wiring.
 */
export function createPaletteProviders(
	app: App,
	everythingClient: EverythingHttpClient,
	options: ProviderFactoryOptions,
): PaletteProviderInstances {
	const fileProvider = new FileProvider(app, options.vaultExtensions, options.log);
	const commandProvider = new CommandProvider(app, options.recentCommandIds);
	const everythingProvider = new EverythingProvider(
		app,
		everythingClient,
		options.everythingSettings,
	);
	const relatedFileProvider = new RelatedFileProvider(app);
	const bookmarkProvider = new BookmarkProvider(app);
	const smartConnectionProvider = new SmartConnectionProvider(app);
	return {
		fileProvider,
		commandProvider,
		everythingProvider,
		relatedFileProvider,
		bookmarkProvider,
		smartConnectionProvider,
		providers: {
			file: fileProvider,
			command: commandProvider,
			everything: everythingProvider,
			link: relatedFileProvider,
			backlink: relatedFileProvider,
			bookmark: bookmarkProvider,
			smart: smartConnectionProvider,
		},
	};
}
