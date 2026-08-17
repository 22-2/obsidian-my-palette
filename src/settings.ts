import { PluginSettingTab, Setting, Notice } from "obsidian";
import type MyPalettePlugin from "src/main";
import {
	type SearchHistoryEntry,
	type MyPaletteSettings,
	DEFAULT_KEYBINDINGS,
	DEFAULT_SETTINGS as MODEL_DEFAULT_SETTINGS,
	type ActionId,
	ACTION_IDS,
} from "src/model/settings";

export type { MyPaletteSettings };

export const DEFAULT_SETTINGS = MODEL_DEFAULT_SETTINGS;

function bounded(value: unknown, fallback: number, min: number, max: number): number {
	return typeof value === "number" && Number.isFinite(value)
		? Math.min(max, Math.max(min, Math.round(value)))
		: fallback;
}

function extensions(value: unknown): string[] {
	if (!Array.isArray(value)) return [...DEFAULT_SETTINGS.everything.vaultExtensions];
	const normalized = value
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim().replace(/^\./, "").toLocaleLowerCase())
		.filter((item) => /^[a-z0-9_-]+$/.test(item));
	return [...new Set(normalized)];
}

function searchHistoryEntries(value: unknown): SearchHistoryEntry[] {
	if (!Array.isArray(value)) return [];
	return value.flatMap((item): SearchHistoryEntry[] => {
		if (!item || typeof item !== "object") return [];
		const entry = item as Record<string, unknown>;
		if (
			typeof entry.input !== "string" ||
			typeof entry.lastSearchedAt !== "number" ||
			!Number.isFinite(entry.lastSearchedAt) ||
			typeof entry.count !== "number" ||
			!Number.isFinite(entry.count)
		)
			return [];
		return [
			{
				input: entry.input,
				lastSearchedAt: entry.lastSearchedAt,
				count: Math.max(1, Math.round(entry.count)),
			},
		];
	});
}

export function mergeSettings(data: unknown): MyPaletteSettings {
	const source = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
	const rawPrefixes = (source.prefixes ?? {}) as Record<string, unknown>;
	const rawEverything = (source.everything ?? {}) as Record<string, unknown>;
	const rawSearchHistory =
		source.searchHistory && typeof source.searchHistory === "object"
			? (source.searchHistory as Record<string, unknown>)
			: {};

	return {
		...DEFAULT_SETTINGS,
		schemaVersion: 6,
		showLog: typeof source.showLog === "boolean" ? source.showLog : false,
		rememberLastInput:
			typeof source.rememberLastInput === "boolean" ? source.rememberLastInput : false,
		openExternalMarkdownInObsidian:
			typeof source.openExternalMarkdownInObsidian === "boolean"
				? source.openExternalMarkdownInObsidian
				: true,
		searchHistory: {
			enabled:
				typeof rawSearchHistory.enabled === "boolean"
					? rawSearchHistory.enabled
					: DEFAULT_SETTINGS.searchHistory.enabled,
			addDelayMs: bounded(
				rawSearchHistory.addDelayMs,
				DEFAULT_SETTINGS.searchHistory.addDelayMs,
				0,
				10000,
			),
			daysToKeep: bounded(
				rawSearchHistory.daysToKeep,
				DEFAULT_SETTINGS.searchHistory.daysToKeep,
				0,
				3650,
			),
			alwaysSuggest:
				typeof rawSearchHistory.alwaysSuggest === "boolean"
					? rawSearchHistory.alwaysSuggest
					: DEFAULT_SETTINGS.searchHistory.alwaysSuggest,
			entries: searchHistoryEntries(rawSearchHistory.entries),
		},
		prefixes: {
			command: typeof rawPrefixes.command === "string" ? rawPrefixes.command : ">",
			everything: typeof rawPrefixes.everything === "string" ? rawPrefixes.everything : "e ",
		},
		everything: {
			httpUrl:
				typeof rawEverything.httpUrl === "string" && rawEverything.httpUrl.trim()
					? rawEverything.httpUrl.trim()
					: DEFAULT_SETTINGS.everything.httpUrl,
			username: typeof rawEverything.username === "string" ? rawEverything.username : "",
			password: typeof rawEverything.password === "string" ? rawEverything.password : "",
			maxResults: bounded(rawEverything.maxResults, 100, 10, 500),
			debounceMs: bounded(rawEverything.debounceMs, 150, 50, 1000),
			requestTimeoutMs: bounded(rawEverything.requestTimeoutMs, 30000, 1000, 60000),
			vaultExtensions: extensions(rawEverything.vaultExtensions),
			directorySearchMarkdownOnly:
				typeof rawEverything.directorySearchMarkdownOnly === "boolean"
					? rawEverything.directorySearchMarkdownOnly
					: true,
		},
		keybindings: mergeKeybindings(source.keybindings),
		recentCommandIds: Array.isArray(source.recentCommandIds)
			? source.recentCommandIds
					.filter((id): id is string => typeof id === "string")
					.slice(0, 20)
			: [],
	};
}

function mergeKeybindings(raw: unknown): Record<ActionId, string[]> {
	const defaults = structuredClone(DEFAULT_KEYBINDINGS);
	if (!raw || typeof raw !== "object") return defaults;
	const obj = raw as Record<string, unknown>;
	for (const action of ACTION_IDS) {
		const value = obj[action];
		if (Array.isArray(value)) {
			defaults[action] = value.filter((v): v is string => typeof v === "string");
		}
	}
	return defaults;
}

export class MyPaletteSettingTab extends PluginSettingTab {
	constructor(public plugin: MyPalettePlugin) {
		super(plugin.app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		new Setting(containerEl).setName("My Palette").setHeading();

		new Setting(containerEl)
			.setName("Everything HTTP Server URL")
			.setDesc("URL configured in the official Everything 1.5 HTTP Server plugin")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_SETTINGS.everything.httpUrl)
					.setValue(this.plugin.settings.everything.httpUrl)
					.onChange(async (value) => {
						this.plugin.settings.everything.httpUrl = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("HTTP username")
			.setDesc("Optional username configured in Everything")
			.addText((text) =>
				text.setValue(this.plugin.settings.everything.username).onChange(async (value) => {
					this.plugin.settings.everything.username = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName("HTTP password")
			.setDesc("Stored in this plugin's local data.json")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(this.plugin.settings.everything.password).onChange(async (value) => {
					this.plugin.settings.everything.password = value;
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl).setName("Maximum Everything results").addSlider((slider) =>
			slider
				.setLimits(10, 500, 10)
				.setValue(this.plugin.settings.everything.maxResults)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.everything.maxResults = value;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName("Vault search extensions")
			.setDesc(
				"Comma-separated extensions used by the file list and es. esdir searches every file type.",
			)
			.addText((text) =>
				text
					.setPlaceholder("md, canvas, base")
					.setValue(this.plugin.settings.everything.vaultExtensions.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.everything.vaultExtensions = extensions(
							value.split(","),
						);
						await this.plugin.saveSettings();
						this.plugin.fileProvider.refreshExtensions();
					}),
			);

		new Setting(containerEl).setName("HTTP request timeout").addSlider((slider) =>
			slider
				.setLimits(1000, 60000, 1000)
				.setValue(this.plugin.settings.everything.requestTimeoutMs)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.everything.requestTimeoutMs = value;
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName("Limit esdir to Markdown files")
			.setDesc("Adds ext:md to esdir searches. Turn off to search every file type.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.everything.directorySearchMarkdownOnly)
					.onChange(async (value) => {
						this.plugin.settings.everything.directorySearchMarkdownOnly = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Test Everything connection")
			.setDesc("Runs a harmless query against the configured HTTP Server")
			.addButton((button) =>
				button.setButtonText("Test").onClick(async () => {
					const result = await this.plugin.testEverythingConnection();
					new Notice(result.ok ? result.message : `Everything: ${result.message}`);
				}),
			);

		new Setting(containerEl).setName("Prefixes").setHeading();
		this.addPrefix(containerEl, "Command prefix", "command");
		this.addPrefix(containerEl, "Everything prefix", "everything");

		new Setting(containerEl).setName("Behavior").setHeading();
		new Setting(containerEl)
			.setName("Enable search history")
			.setDesc("Remember search input across all palette modes.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.searchHistory.enabled)
					.onChange(async (value) => {
						this.plugin.settings.searchHistory.enabled = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Search history add delay")
			.setDesc(
				"Milliseconds of input inactivity before adding a search. 0 means Enter or action only.",
			)
			.addSlider((slider) =>
				slider
					.setLimits(0, 10000, 1000)
					.setValue(this.plugin.settings.searchHistory.addDelayMs)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.searchHistory.addDelayMs = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Keep search history")
			.setDesc("Number of days to keep entries. 0 keeps them forever.")
			.addSlider((slider) =>
				slider
					.setLimits(0, 3650, 30)
					.setValue(this.plugin.settings.searchHistory.daysToKeep)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.searchHistory.daysToKeep = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Always show search suggestions")
			.setDesc(
				"Show history suggestions on every input change instead of only with Ctrl+Space.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.searchHistory.alwaysSuggest)
					.onChange(async (value) => {
						this.plugin.settings.searchHistory.alwaysSuggest = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Clear search history")
			.setDesc("Permanently remove all stored search history.")
			.addButton((button) =>
				button.setButtonText("Clear").onClick(() => {
					this.plugin.clearSearchHistory();
					new Notice("Search history cleared.");
				}),
			);
		new Setting(containerEl)
			.setName("Open external Markdown in Obsidian")
			.setDesc(
				"Open Markdown files outside the Vault in a virtual Obsidian editor. Turn this off to open them in VS Code.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.openExternalMarkdownInObsidian)
					.onChange(async (value) => {
						this.plugin.settings.openExternalMarkdownInObsidian = value;
						await this.plugin.saveSettings();
					}),
			);
		new Setting(containerEl)
			.setName("Remember last input")
			.setDesc(
				"Restores the last query for each palette mode until Obsidian is closed. Search text is not saved to disk.",
			)
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.rememberLastInput).onChange(async (value) => {
					this.plugin.settings.rememberLastInput = value;
					if (!value) this.plugin.clearRememberedPaletteQueries();
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl).setName("Keybindings").setHeading();
		for (const action of ACTION_IDS) {
			this.addKeybinding(containerEl, action);
		}

		new Setting(containerEl).setName("Developer").setHeading();
		new Setting(containerEl).setName("Show debug messages").addToggle((toggle) =>
			toggle.setValue(this.plugin.settings.showLog).onChange(async (value) => {
				this.plugin.settings.showLog = value;
				await this.plugin.saveSettings();
				this.plugin.initializeLogger();
			}),
		);
	}

	private addPrefix(containerEl: HTMLElement, name: string, key: "command" | "everything"): void {
		new Setting(containerEl).setName(name).addText((text) =>
			text.setValue(this.plugin.settings.prefixes[key]).onChange(async (value) => {
				this.plugin.settings.prefixes[key] = value.replace(/[\r\n]/g, "");
				await this.plugin.saveSettings();
			}),
		);
	}

	private addKeybinding(containerEl: HTMLElement, action: ActionId): void {
		const keybindings = this.plugin.settings.keybindings[action] ?? [];
		new Setting(containerEl)
			.setName(action)
			.setDesc("Comma-separated shortcuts")
			.addText((text) =>
				text.setValue(keybindings.join(", ")).onChange(async (value) => {
					this.plugin.settings.keybindings[action] = value
						.split(",")
						.map((v) => v.trim())
						.filter(Boolean);
					await this.plugin.saveSettings();
				}),
			);
	}
}
