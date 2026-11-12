import type { App } from "obsidian";
import type { MyPaletteSettings, PaletteSurface, IntegrationReadiness } from "src/settings/model";

/** The slice of the plugin that the settings UI reads and acts on. */
export interface SettingsHost {
	app: App;
	settings: MyPaletteSettings;
	integrationAvailability: { readonly current: IntegrationReadiness };
	saveSettings(): Promise<void>;
	initializeLogger(): void;
	paletteDisplaySettings: {
		setHighlight(surface: PaletteSurface, value: boolean): Promise<void>;
	};
	testEverythingConnection(): Promise<{ ok: boolean; message: string }>;
	fileProvider: {
		rebuildIgnoredIndex(): Promise<unknown>;
		refreshExtensions(): void;
	};
}
