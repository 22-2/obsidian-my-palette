import {
	Notice,
	Setting,
	type SettingDefinitionControl,
	type SettingDefinitionGroup,
	type SettingDefinitionItem,
	type SettingDefinitionPage,
	type SettingDefinitionRender,
	type SettingGroupItem,
} from "obsidian";
import type MyPalettePlugin from "src/main";
import { DEFAULT_SETTINGS, MILLISECONDS_PER_SECOND, SETTING_LIMITS } from "src/model/settings";
import { extensions } from "src/settings/mergeSettings";
import { renderFileSortPriorityControl } from "src/settings/fileSortPriorityControl";

type ControlType = "text" | "toggle" | "slider";
type ControlItem = Pick<SettingDefinitionControl, "control">;
type PageItem = SettingDefinitionPage;
type GroupItem = SettingDefinitionGroup;
type SetControlValue = (key: string, value: unknown) => Promise<void>;

interface SettingPageHelpers {
	control: (type: ControlType, key: string, extra?: Record<string, unknown>) => ControlItem;
	page: (name: string, desc: string, items: SettingDefinitionItem[]) => PageItem;
	group: (heading: string, items: SettingGroupItem[]) => GroupItem;
	render: (
		name: string,
		desc: string,
		callback: (setting: Setting) => void,
	) => SettingDefinitionRender;
}

const createSettingPageHelpers = (): SettingPageHelpers => ({
	control: (type: ControlType, key: string, extra: Record<string, unknown> = {}) =>
		({
			control: { type, key, ...extra },
		}) as ControlItem,
	page: (name: string, desc: string, items: SettingDefinitionItem[]) => ({
		type: "page",
		name,
		desc,
		items,
	}),
	group: (heading: string, items: SettingGroupItem[]) => ({
		type: "group",
		heading,
		items,
	}),
	render: (name: string, desc: string, callback: (setting: Setting) => void) =>
		({
			name,
			desc,
			render: (setting: Setting) => callback(setting),
		}) as SettingDefinitionRender,
});

/**
 * Build pages around user tasks instead of the persisted object shape. This
 * keeps navigation discoverable even when settings are stored in nested groups.
 */
export function createSettingPages(
	plugin: MyPalettePlugin,
	setControlValue: SetControlValue,
): SettingDefinitionItem[] {
	const helpers = createSettingPageHelpers();

	return [
		createPalettePage(helpers),
		createFileSearchPage(plugin, helpers),
		createSearchHistoryPage(plugin, helpers),
		createEverythingPage(plugin, setControlValue, helpers),
		createFileOpeningPage(helpers),
		createAdvancedPage(helpers),
	];
}

function createFileSearchPage(plugin: MyPalettePlugin, helpers: SettingPageHelpers): PageItem {
	return helpers.page("File search", "Control how Vault files are ordered in the palette.", [
		helpers.group("Sorting", [
			helpers.render(
				"Sort priorities",
				"Choose priorities separately for blank and typed input. Enabled priorities run from top to bottom; drag them to reorder. @prior:desc puts higher-priority notes first, Activity combines recent opens with persistent palette usage, and missing prior values are last.",
				(setting) => {
					renderFileSortPriorityControl(
						setting,
						plugin.settings.file.sortPriorities,
						() => plugin.saveSettings(),
					);
				},
			),
		]),
	]);
}

function createPalettePage(helpers: SettingPageHelpers): PageItem {
	return helpers.page("Palette", "Set prefixes and what the palette remembers.", [
		helpers.group("Prefixes", [
			{
				name: "Command prefix",
				desc: "Prefix used to search Obsidian commands.",
				...helpers.control("text", "prefixes.command"),
			},
			{
				name: "Everything prefix",
				desc: "Prefix used to search Everything.",
				...helpers.control("text", "prefixes.everything"),
			},
			{
				name: "Include ignored prefix",
				desc: "Prefix that includes Excluded files in supported file searches.",
				...helpers.control("text", "prefixes.includeIgnored"),
			},
		]),
		helpers.group("Palette behavior", [
			{
				name: "Remember last input",
				desc: "Restore the last query for each palette mode until Obsidian is closed. Search text is not saved to disk.",
				...helpers.control("toggle", "rememberLastInput"),
			},
		]),
	]);
}

function createSearchHistoryPage(plugin: MyPalettePlugin, helpers: SettingPageHelpers): PageItem {
	return helpers.page("Search history", "Control history suggestions and retention.", [
		helpers.group("History", [
			{
				name: "Enable search history",
				desc: "Remember searches after a result is used across all palette modes.",
				...helpers.control("toggle", "searchHistory.enabled"),
			},
			{
				name: "Add delay",
				desc: "Optional milliseconds of input inactivity before adding a search. 0 means action only.",
				...helpers.control("slider", "searchHistory.addDelayMs", {
					min: SETTING_LIMITS.searchHistory.addDelayMs.min,
					max: SETTING_LIMITS.searchHistory.addDelayMs.max,
					step: SETTING_LIMITS.searchHistory.addDelayMs.step,
					displayFormat: (value: number) =>
						value === SETTING_LIMITS.searchHistory.addDelayMs.min
							? "Off"
							: `${value / MILLISECONDS_PER_SECOND}s`,
				}),
			},
			{
				name: "Keep history",
				desc: "Number of days to keep entries. 0 keeps them forever.",
				...helpers.control("slider", "searchHistory.daysToKeep", {
					min: SETTING_LIMITS.searchHistory.daysToKeep.min,
					max: SETTING_LIMITS.searchHistory.daysToKeep.max,
					step: SETTING_LIMITS.searchHistory.daysToKeep.step,
					displayFormat: (value: number) =>
						value === SETTING_LIMITS.searchHistory.daysToKeep.min
							? "Forever"
							: `${value} days`,
				}),
			},
			{
				name: "Clear search history",
				desc: "Permanently remove all stored search history.",
				action: () => {
					plugin.clearSearchHistory();
					new Notice("Search history cleared.");
				},
			},
		]),
	]);
}

function createEverythingPage(
	plugin: MyPalettePlugin,
	setControlValue: SetControlValue,
	helpers: SettingPageHelpers,
): PageItem {
	return helpers.page("Everything", "Connect to Everything 1.5 and tune file search.", [
		helpers.group("Connection", [
			{
				name: "HTTP server URL",
				desc: "URL configured in the official Everything 1.5 HTTP Server plugin.",
				...helpers.control("text", "everything.httpUrl", {
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
				...helpers.control("text", "everything.username"),
			},
			helpers.render("Password", "Stored in this plugin's local data.json.", (setting) =>
				setting.addText((text) => {
					text.inputEl.type = "password";
					text.setValue(plugin.settings.everything.password).onChange(
						(value) => void setControlValue("everything.password", value),
					);
				}),
			),
			{
				name: "Test connection",
				desc: "Runs a harmless query against the configured HTTP Server.",
				action: async () => {
					const result = await plugin.testEverythingConnection();
					new Notice(result.ok ? result.message : `Everything: ${result.message}`);
				},
			},
		]),
		helpers.group("Search", [
			{
				name: "Maximum results",
				desc: "Maximum number of results returned by Everything.",
				...helpers.control("slider", "everything.maxResults", {
					min: SETTING_LIMITS.everything.maxResults.min,
					max: SETTING_LIMITS.everything.maxResults.max,
					step: SETTING_LIMITS.everything.maxResults.step,
				}),
			},
			{
				name: "Request timeout",
				desc: "Maximum time to wait for an Everything response.",
				...helpers.control("slider", "everything.requestTimeoutMs", {
					min: SETTING_LIMITS.everything.requestTimeoutMs.min,
					max: SETTING_LIMITS.everything.requestTimeoutMs.max,
					step: SETTING_LIMITS.everything.requestTimeoutMs.step,
					displayFormat: (value: number) => `${value / MILLISECONDS_PER_SECOND}s`,
				}),
			},
			{
				name: "Search debounce",
				desc: "Delay before sending a new Everything search.",
				...helpers.control("slider", "everything.debounceMs", {
					min: SETTING_LIMITS.everything.debounceMs.min,
					max: SETTING_LIMITS.everything.debounceMs.max,
					step: SETTING_LIMITS.everything.debounceMs.step,
					displayFormat: (value: number) => `${value}ms`,
				}),
			},
			helpers.render(
				"Vault search extensions",
				"Comma-separated extensions used by the file list. esdir searches every file type.",
				(setting) =>
					setting.addText((text) =>
						text
							.setPlaceholder("md, canvas, base")
							.setValue(plugin.settings.everything.vaultExtensions.join(", "))
							.onChange(async (value) => {
								plugin.settings.everything.vaultExtensions = extensions(
									value.split(","),
								);
								await plugin.saveSettings();
								plugin.fileProvider.refreshExtensions();
							}),
					),
			),
			{
				name: "Limit esdir to Markdown files",
				desc: "Adds ext:md to esdir searches. Turn off to search every file type.",
				...helpers.control("toggle", "everything.directorySearchMarkdownOnly"),
			},
		]),
	]);
}

function createFileOpeningPage(helpers: SettingPageHelpers): PageItem {
	return helpers.page("File opening", "Choose how files outside the vault are opened.", [
		helpers.group("External Markdown", [
			{
				name: "Open external Markdown in Obsidian",
				desc: "Open Markdown files outside the vault in a virtual Obsidian editor.",
				...helpers.control("toggle", "openExternalMarkdownInObsidian"),
			},
		]),
	]);
}

function createAdvancedPage(helpers: SettingPageHelpers): PageItem {
	return helpers.page("Advanced", "Diagnostics and developer options.", [
		helpers.group("Developer", [
			{
				name: "Show debug messages",
				desc: "Write debug messages to the developer console.",
				...helpers.control("toggle", "showLog"),
			},
		]),
	]);
}
