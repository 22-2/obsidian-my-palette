import type { App } from "obsidian";
import { getSettingWindow } from "src/platform/obsidianInternals";

/** Whether the plugin registered a settings tab; disabled plugins have none. */
export function hasPluginSettingsTab(app: App, pluginId: string): boolean {
	return getSettingWindow(app)?.pluginTabs?.some((tab) => tab.id === pluginId) ?? false;
}

/** Opens the Settings window on the plugin's tab; openTabById alone only switches tabs in an open window. */
export function openPluginSettings(app: App, pluginId: string): void {
	const setting = getSettingWindow(app);
	if (!setting) return;
	setting.open();
	setting.openTabById(pluginId);
}
