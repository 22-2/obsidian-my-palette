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
import { excludedFolders, extensions } from "src/settings/mergeSettings";
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
 * Keep the top level to three task-oriented pages. Obsidian opens plugin
 * settings in a separate window, so a page for every small setting group makes
 * users hunt through links before they can see the controls they need.
 */
export function createSettingPages(
	plugin: MyPalettePlugin,
	setControlValue: SetControlValue,
): SettingDefinitionItem[] {
	const helpers = createSettingPageHelpers();

	return [
		createPalettePage(plugin, helpers),
		createFileSearchPage(plugin, helpers),
		createEverythingPage(plugin, setControlValue, helpers),
	];
}

function createFileSearchPage(plugin: MyPalettePlugin, helpers: SettingPageHelpers): PageItem {
	return helpers.page(
		"Vault file search",
		"Excluded folders, ignored-note indexing, and result sorting for Vault files.",
		[
			helpers.group("Excluded folders", [
				helpers.render(
					"Excluded folders",
					"Folder paths hidden from every file list, one per line. Subfolders are also hidden.",
					(setting) =>
						setting.addTextArea((text) =>
							text
								.setPlaceholder("archive\nprivate/diary")
								.setValue(plugin.settings.file.excludedFolders.join("\n"))
								.onChange(async (value) => {
									// 保存時に正規化して重複を除くことで表示と検索判定のズレを防ぐ。
									plugin.settings.file.excludedFolders = excludedFolders(value);
									await plugin.saveSettings();
								}),
						),
				),
			]),
			helpers.group("Ignored note index", [
				{
					name: "Rebuild ignored note index",
					desc: "Rescan files hidden by Obsidian's excluded-folder filters so they are available with the include-ignored prefix.",
					action: async () => {
						// Keep index maintenance with the file-search settings because it
						// repairs the cache used by the include-ignored search scope.
						await plugin.fileProvider.rebuildIgnoredIndex();
						new Notice("Ignored note index rebuilt.");
					},
				},
			]),
			helpers.group("Result sorting", [
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
		],
	);
}

function createPalettePage(plugin: MyPalettePlugin, helpers: SettingPageHelpers): PageItem {
	return helpers.page(
		"Palette",
		"Prefixes, remembered input, search history, external Markdown, and diagnostics.",
		[
			// helpers.group("Prefixes", [
			// 	{
			// 		name: "Command prefix",
			// 		desc: "Prefix used to search Obsidian commands.",
			// 		...helpers.control("text", "prefixes.command"),
			// 	},
			// 	{
			// 		name: "Everything prefix",
			// 		desc: "Prefix used to search Everything.",
			// 		...helpers.control("text", "prefixes.everything"),
			// 	},
			// 	{
			// 		name: "Include ignored prefix",
			// 		desc: "Prefix that includes excluded folders in supported file searches.",
			// 		...helpers.control("text", "prefixes.includeIgnored"),
			// 	},
			// ]),
			helpers.group("Palette behavior", [
				{
					name: "Remember last input",
					desc: "Restore the last query for each palette mode until Obsidian is closed. Search text is not saved to disk.",
					...helpers.control("toggle", "rememberLastInput"),
				},
			]),
			helpers.group("Search history", [
				// {
				// 	name: "Enable search history",
				// 	desc: "Remember searches after a result is used, across all palette modes.",
				// 	...helpers.control("toggle", "searchHistory.enabled"),
				// },
				// {
				// 	name: "Keep history",
				// 	desc: "Number of days to keep entries. 0 keeps them forever.",
				// 	...helpers.control("slider", "searchHistory.daysToKeep", {
				// 		min: SETTING_LIMITS.searchHistory.daysToKeep.min,
				// 		max: SETTING_LIMITS.searchHistory.daysToKeep.max,
				// 		step: SETTING_LIMITS.searchHistory.daysToKeep.step,
				// 		displayFormat: (value: number) =>
				// 			value === SETTING_LIMITS.searchHistory.daysToKeep.min
				// 				? "Forever"
				// 				: `${value} days`,
				// 	}),
				// },
				{
					name: "Clear search history",
					desc: "Permanently remove all stored search history.",
					action: () => {
						plugin.clearSearchHistory();
						new Notice("Search history cleared.");
					},
				},
			]),
			// helpers.group("File opening", [
			// 	{
			// 		name: "Open external Markdown in Obsidian",
			// 		desc: "Open Markdown files outside the vault in a virtual Obsidian editor.",
			// 		...helpers.control("toggle", "openExternalMarkdownInObsidian"),
			// 	},
			// ]),
			helpers.group("Diagnostics", [
				{
					name: "Show debug messages",
					desc: "Write debug messages to the developer console.",
					...helpers.control("toggle", "showLog"),
				},
			]),
		],
	);
}

function createEverythingPage(
	plugin: MyPalettePlugin,
	setControlValue: SetControlValue,
	helpers: SettingPageHelpers,
): PageItem {
	return helpers.page(
		"Everything",
		"Everything 1.5 connection, credentials, result limits, extensions, and search timing.",
		[
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
			// helpers.group("Search", [
			// 	{
			// 		name: "Maximum results",
			// 		desc: "Maximum number of results returned by Everything.",
			// 		...helpers.control("slider", "everything.maxResults", {
			// 			min: SETTING_LIMITS.everything.maxResults.min,
			// 			max: SETTING_LIMITS.everything.maxResults.max,
			// 			step: SETTING_LIMITS.everything.maxResults.step,
			// 		}),
			// 	},
			// 	{
			// 		name: "Request timeout",
			// 		desc: "Maximum time to wait for an Everything response.",
			// 		...helpers.control("slider", "everything.requestTimeoutMs", {
			// 			min: SETTING_LIMITS.everything.requestTimeoutMs.min,
			// 			max: SETTING_LIMITS.everything.requestTimeoutMs.max,
			// 			step: SETTING_LIMITS.everything.requestTimeoutMs.step,
			// 			displayFormat: (value: number) => `${value / MILLISECONDS_PER_SECOND}s`,
			// 		}),
			// 	},
			// 	{
			// 		name: "Search debounce",
			// 		desc: "Delay before sending a new Everything search.",
			// 		...helpers.control("slider", "everything.debounceMs", {
			// 			min: SETTING_LIMITS.everything.debounceMs.min,
			// 			max: SETTING_LIMITS.everything.debounceMs.max,
			// 			step: SETTING_LIMITS.everything.debounceMs.step,
			// 			displayFormat: (value: number) => `${value}ms`,
			// 		}),
			// 	},
			// ]),
			helpers.group("Vault search", [
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
		],
	);
}
