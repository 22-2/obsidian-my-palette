import type { App } from "obsidian";

interface SettingHost {
	open(): void;
	openTabById(id: string): void;
	/** Tabs that plugins register; settingTabs holds only Obsidian's own pages. */
	pluginTabs?: readonly { id?: string }[];
}

function settingHost(app: App): SettingHost | undefined {
	return (app as unknown as { setting?: SettingHost }).setting;
}

/** Whether the plugin registered a settings tab; disabled plugins have none. */
export function hasPluginSettingsTab(app: App, pluginId: string): boolean {
	return settingHost(app)?.pluginTabs?.some((tab) => tab.id === pluginId) ?? false;
}

/** Opens the Settings window on the plugin's tab; openTabById alone only switches tabs in an open window. */
export function openPluginSettings(app: App, pluginId: string): void {
	const setting = settingHost(app);
	if (!setting) return;
	setting.open();
	setting.openTabById(pluginId);
}
