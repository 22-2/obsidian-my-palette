import { PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type MyPalettePlugin from "src/main";
import { DEFAULT_SETTINGS, SETTING_LIMITS } from "src/model/settings";
import { bounded, excludedFolders } from "src/settings/mergeSettings";
import { createSettingPages } from "src/settings/settingPages";

export class MyPaletteSettingTab extends PluginSettingTab {
	constructor(public plugin: MyPalettePlugin) {
		super(plugin.app, plugin);
	}

	getControlValue(key: string): unknown {
		const values: Record<string, unknown> = {
			"everything.httpUrl": this.plugin.settings.everything.httpUrl,
			"everything.username": this.plugin.settings.everything.username,
			"everything.password": this.plugin.settings.everything.password,
			"everything.maxResults": this.plugin.settings.everything.maxResults,
			"everything.debounceMs": this.plugin.settings.everything.debounceMs,
			"everything.requestTimeoutMs": this.plugin.settings.everything.requestTimeoutMs,
			"everything.directorySearchMarkdownOnly":
				this.plugin.settings.everything.directorySearchMarkdownOnly,
			"searchHistory.enabled": this.plugin.settings.searchHistory.enabled,
			"searchHistory.addDelayMs": this.plugin.settings.searchHistory.addDelayMs,
			"searchHistory.daysToKeep": this.plugin.settings.searchHistory.daysToKeep,
			"prefixes.command": this.plugin.settings.prefixes.command,
			"prefixes.everything": this.plugin.settings.prefixes.everything,
			"prefixes.includeIgnored": this.plugin.settings.prefixes.includeIgnored,
			"file.excludedFolders": this.plugin.settings.file.excludedFolders.join("\n"),
			openExternalMarkdownInObsidian: this.plugin.settings.openExternalMarkdownInObsidian,
			rememberLastInput: this.plugin.settings.rememberLastInput,
			showLog: this.plugin.settings.showLog,
		};
		return values[key];
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		const settings = this.plugin.settings;
		switch (key) {
			case "everything.httpUrl":
				settings.everything.httpUrl = String(value).trim();
				break;
			case "everything.username":
				settings.everything.username = String(value);
				break;
			case "everything.password":
				settings.everything.password = String(value);
				break;
			case "everything.maxResults":
				settings.everything.maxResults = bounded(
					value,
					DEFAULT_SETTINGS.everything.maxResults,
					SETTING_LIMITS.everything.maxResults.min,
					SETTING_LIMITS.everything.maxResults.max,
				);
				break;
			case "everything.debounceMs":
				settings.everything.debounceMs = bounded(
					value,
					DEFAULT_SETTINGS.everything.debounceMs,
					SETTING_LIMITS.everything.debounceMs.min,
					SETTING_LIMITS.everything.debounceMs.max,
				);
				break;
			case "everything.requestTimeoutMs":
				settings.everything.requestTimeoutMs = bounded(
					value,
					DEFAULT_SETTINGS.everything.requestTimeoutMs,
					SETTING_LIMITS.everything.requestTimeoutMs.min,
					SETTING_LIMITS.everything.requestTimeoutMs.max,
				);
				break;
			case "everything.directorySearchMarkdownOnly":
				settings.everything.directorySearchMarkdownOnly = Boolean(value);
				break;
			case "searchHistory.enabled":
				settings.searchHistory.enabled = Boolean(value);
				break;
			case "searchHistory.addDelayMs":
				settings.searchHistory.addDelayMs = bounded(
					value,
					DEFAULT_SETTINGS.searchHistory.addDelayMs,
					SETTING_LIMITS.searchHistory.addDelayMs.min,
					SETTING_LIMITS.searchHistory.addDelayMs.max,
				);
				break;
			case "searchHistory.daysToKeep":
				// Keep interactive edits aligned with the documented default when the control value is invalid.
				settings.searchHistory.daysToKeep = bounded(
					value,
					DEFAULT_SETTINGS.searchHistory.daysToKeep,
					SETTING_LIMITS.searchHistory.daysToKeep.min,
					SETTING_LIMITS.searchHistory.daysToKeep.max,
				);
				break;
			case "prefixes.command":
				settings.prefixes.command = String(value).replace(/[\r\n]/g, "");
				break;
			case "prefixes.everything":
				settings.prefixes.everything = String(value).replace(/[\r\n]/g, "");
				break;
			case "prefixes.includeIgnored":
				settings.prefixes.includeIgnored = String(value).replace(/[\r\n]/g, "");
				break;
			case "file.excludedFolders":
				settings.file.excludedFolders = excludedFolders(String(value));
				break;
			case "openExternalMarkdownInObsidian":
				settings.openExternalMarkdownInObsidian = Boolean(value);
				break;
			case "rememberLastInput":
				settings.rememberLastInput = Boolean(value);
				if (!settings.rememberLastInput) this.plugin.clearRememberedPaletteQueries();
				break;
			case "showLog":
				settings.showLog = Boolean(value);
				this.plugin.initializeLogger();
				break;
			default:
				throw new Error(`Unknown setting key: ${key}`);
		}
		await this.plugin.saveSettings();
		if (key === "everything.httpUrl") this.refreshDomState();
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		return createSettingPages(this.plugin, (key, value) => this.setControlValue(key, value));
	}
}
