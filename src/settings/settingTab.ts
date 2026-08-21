import {
	Notice,
	PluginSettingTab,
	Setting,
	type SettingDefinitionControl,
	type SettingDefinitionItem,
	type SettingDefinitionRender,
	type SettingGroupItem,
} from "obsidian";
import type MyPalettePlugin from "src/main";
import { DEFAULT_SETTINGS } from "src/model/settings";
import { bounded, extensions } from "src/settings/mergeSettings";

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
				settings.everything.maxResults = bounded(value, 100, 10, 500);
				break;
			case "everything.debounceMs":
				settings.everything.debounceMs = bounded(value, 150, 50, 1000);
				break;
			case "everything.requestTimeoutMs":
				settings.everything.requestTimeoutMs = bounded(value, 30000, 1000, 60000);
				break;
			case "everything.directorySearchMarkdownOnly":
				settings.everything.directorySearchMarkdownOnly = Boolean(value);
				break;
			case "searchHistory.enabled":
				settings.searchHistory.enabled = Boolean(value);
				break;
			case "searchHistory.addDelayMs":
				settings.searchHistory.addDelayMs = bounded(value, 3000, 0, 10000);
				break;
			case "searchHistory.daysToKeep":
				settings.searchHistory.daysToKeep = bounded(value, 360, 0, 3650);
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
		const control = (
			type: "text" | "toggle" | "slider",
			key: string,
			extra: Record<string, unknown> = {},
		) =>
			({
				control: { type, key, ...extra },
			}) as Pick<SettingDefinitionControl, "control">;
		const page = (name: string, desc: string, items: SettingDefinitionItem[]) => ({
			type: "page" as const,
			name,
			desc,
			items,
		});
		const group = (heading: string, items: SettingGroupItem[]) => ({
			type: "group" as const,
			heading,
			items,
		});
		const render = (name: string, desc: string, callback: (setting: Setting) => void) =>
			({
				name,
				desc,
				render: (setting: Setting) => callback(setting),
			}) as SettingDefinitionRender;

		return [
			page("Everything connection", "Connect My Palette to the Everything 1.5 HTTP Server.", [
				group("Server", [
					{
						name: "HTTP server URL",
						desc: "URL configured in the official Everything 1.5 HTTP Server plugin.",
						...control("text", "everything.httpUrl", {
							placeholder: DEFAULT_SETTINGS.everything.httpUrl,
							validate: (value: string) => {
								try {
									new URL(value);
								} catch {
									return "Enter a valid URL.";
								}
							},
						}),
					},
					{
						name: "Username",
						desc: "Optional username configured in Everything.",
						...control("text", "everything.username"),
					},
					render("Password", "Stored in this plugin's local data.json.", (setting) =>
						setting.addText((text) => {
							text.inputEl.type = "password";
							text.setValue(this.plugin.settings.everything.password).onChange(
								(value) => void this.setControlValue("everything.password", value),
							);
						}),
					),
					{
						name: "Maximum results",
						desc: "Maximum number of results returned by Everything.",
						...control("slider", "everything.maxResults", {
							min: 10,
							max: 500,
							step: 10,
						}),
					},
					{
						name: "Request timeout",
						desc: "Maximum time to wait for an Everything response.",
						...control("slider", "everything.requestTimeoutMs", {
							min: 1000,
							max: 60000,
							step: 1000,
							displayFormat: (value: number) => `${value / 1000}s`,
						}),
					},
					{
						name: "Search debounce",
						desc: "Delay before sending a new Everything search.",
						...control("slider", "everything.debounceMs", {
							min: 50,
							max: 1000,
							step: 50,
							displayFormat: (value: number) => `${value}ms`,
						}),
					},
				]),
				group("Vault search", [
					render(
						"Vault search extensions",
						"Comma-separated extensions used by the file list. esdir searches every file type.",
						(setting) =>
							setting.addText((text) =>
								text
									.setPlaceholder("md, canvas, base")
									.setValue(
										this.plugin.settings.everything.vaultExtensions.join(", "),
									)
									.onChange(async (value) => {
										this.plugin.settings.everything.vaultExtensions =
											extensions(value.split(","));
										await this.plugin.saveSettings();
										this.plugin.fileProvider.refreshExtensions();
									}),
							),
					),
					{
						name: "Limit esdir to Markdown files",
						desc: "Adds ext:md to esdir searches. Turn off to search every file type.",
						...control("toggle", "everything.directorySearchMarkdownOnly"),
					},
					{
						name: "Test connection",
						desc: "Runs a harmless query against the configured HTTP Server.",
						action: async () => {
							const result = await this.plugin.testEverythingConnection();
							new Notice(
								result.ok ? result.message : `Everything: ${result.message}`,
							);
						},
					},
				]),
			]),
			page(
				"Search and behavior",
				"Control prefixes, search history, and file opening behavior.",
				[
					group("Prefixes", [
						{
							name: "Command prefix",
							desc: "Prefix used to search Obsidian commands.",
							...control("text", "prefixes.command"),
						},
						{
							name: "Everything prefix",
							desc: "Prefix used to search Everything.",
							...control("text", "prefixes.everything"),
						},
						{
							name: "Include ignored prefix",
							desc: "Prefix that includes Excluded files in supported file searches.",
							...control("text", "prefixes.includeIgnored"),
						},
					]),
					group("Search history", [
						{
							name: "Enable search history",
							desc: "Remember search input across all palette modes.",
							...control("toggle", "searchHistory.enabled"),
						},
						{
							name: "Add delay",
							desc: "Milliseconds of input inactivity before adding a search. 0 means Enter or action only.",
							...control("slider", "searchHistory.addDelayMs", {
								min: 0,
								max: 10000,
								step: 1000,
								displayFormat: (value: number) =>
									value === 0 ? "Off" : `${value / 1000}s`,
							}),
						},
						{
							name: "Keep history",
							desc: "Number of days to keep entries. 0 keeps them forever.",
							...control("slider", "searchHistory.daysToKeep", {
								min: 0,
								max: 3650,
								step: 30,
								displayFormat: (value: number) =>
									value === 0 ? "Forever" : `${value} days`,
							}),
						},
						{
							name: "Clear search history",
							desc: "Permanently remove all stored search history.",
							action: () => {
								this.plugin.clearSearchHistory();
								new Notice("Search history cleared.");
							},
						},
					]),
					group("File opening", [
						{
							name: "Open external Markdown in Obsidian",
							desc: "Open Markdown files outside the vault in a virtual Obsidian editor.",
							...control("toggle", "openExternalMarkdownInObsidian"),
						},
						{
							name: "Remember last input",
							desc: "Restore the last query for each palette mode until Obsidian is closed. Search text is not saved to disk.",
							...control("toggle", "rememberLastInput"),
						},
					]),
				],
			),
			page("Advanced", "Diagnostics and developer options.", [
				group("Developer", [
					{
						name: "Show debug messages",
						desc: "Write debug messages to the developer console.",
						...control("toggle", "showLog"),
					},
				]),
			]),
		];
	}
}
