import type { MyPaletteSettings } from "src/settings/model";

/** The slice of the plugin that the settings UI reads and acts on. */
export interface SettingsHost {
	settings: MyPaletteSettings;
	saveSettings(): Promise<void>;
	initializeLogger(): void;
	clearSearchHistory(): void;
	testEverythingConnection(): Promise<{ ok: boolean; message: string }>;
	fileProvider: {
		rebuildIgnoredIndex(): Promise<unknown>;
		refreshExtensions(): void;
	};
	paletteOpener: { clearRememberedQueries(): void };
}
