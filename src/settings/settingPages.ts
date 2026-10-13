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
import type { SettingsHost } from "src/settings/settingsHost";
import { SETTING_LIMITS, type PaletteSurface, type ReturnToHomeSeconds } from "src/settings/model";

const RETURN_TO_HOME_LABELS: Record<string, string> = {
	"0": "Immediately",
	"30": "After 30 seconds",
	"60": "After 60 seconds",
	"90": "After 90 seconds",
};
import { excludedFolders, extensions } from "src/settings/mergeSettings";
import { renderFileSortPriorityControl } from "src/settings/fileSortPriorityControl";
import { renderShortcutsTable } from "src/settings/shortcutsTable";
import {
	EVERYTHING_MODAL_ITEMS,
	isSmartConnectionsInstalled,
	renderEverythingIntegration,
	renderSmartConnectionsIntegration,
	renderVscodeIntegration,
} from "src/settings/integrationSettings";
import { PALETTE_MODES } from "src/palette/modes";
import { renderModeSetting } from "src/settings/modeSettingControl";

type ControlType = "text" | "toggle" | "slider";
type ControlItem = Pick<SettingDefinitionControl, "control">;
type PageItem = SettingDefinitionPage;
type GroupItem = SettingDefinitionGroup;

interface SettingPageHelpers {
	control: (type: ControlType, key: string, extra?: Record<string, unknown>) => ControlItem;
	page: (name: string, desc: string, items: SettingDefinitionItem[]) => PageItem;
	group: (heading: string, items: SettingGroupItem[]) => GroupItem;
	render: (
		name: string,
		desc: string,
		callback: (setting: Setting) => unknown,
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
		}) satisfies SettingDefinitionRender,
});

/**
 * Keep the top level organized by task. Obsidian opens plugin
 * settings in a separate window, so a page for every small setting group makes
 * users hunt through links before they can see the controls they need.
 */
export function createSettingPages(plugin: SettingsHost): SettingDefinitionItem[] {
	const helpers = createSettingPageHelpers();

	return [
		createGeneralPage(plugin, helpers),
		createModesPage(plugin, helpers),
		createFileSearchPage(plugin, helpers),
		createShortcutsPage(plugin, helpers),
		createIntegrationsPage(plugin, helpers),
	];
}

function createShortcutsPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(
		"Shortcuts",
		"Click a keybinding to record a new one. Backspace or Delete turns it off, and Escape cancels. Arrow keys, Enter and Tab keep their standard behavior.",
		[
			helpers.group("Palette and selector shortcuts", [
				helpers.render("", "", (setting) => renderShortcutsTable(setting, plugin)),
			]),
		],
	);
}

function createFileSearchPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(
		"File search",
		"Which files the palette lists, which folders are hidden or ranked lower, and how results are sorted.",
		[
			helpers.group("File types", [
				helpers.render(
					"Vault search extensions",
					"Comma-separated extensions used by the file list. Everything searches every file type when Obsidian-excluded is on.",
					(setting) =>
						setting.addText((text) =>
							text
								.setPlaceholder("Example: md, canvas, base")
								.setValue(plugin.settings.everything.vaultExtensions.join(", "))
								.onChange((value) => {
									plugin.settings.everything.vaultExtensions = extensions(
										value.split(","),
									);
									void plugin.saveSettings();
									plugin.fileProvider.refreshExtensions();
								}),
						),
				),
			]),
			helpers.group("Excluded folders", [
				helpers.render(
					"Excluded folders",
					"Folder paths hidden from every file list, one per line. Subfolders are also hidden.",
					(setting) =>
						setting.addTextArea((text) =>
							text
								.setPlaceholder("Archive\nprivate/diary")
								.setValue(plugin.settings.file.excludedFolders.join("\n"))
								.onChange((value) => {
									// 保存時に正規化して重複を除くことで表示と検索判定のズレを防ぐ。
									plugin.settings.file.excludedFolders = excludedFolders(value);
									void plugin.saveSettings();
								}),
						),
				),
			]),
			helpers.group("Lower prior folders", [
				helpers.render(
					"Lower prior folders",
					"Folder paths to rank lower, one per line, including subfolders. Enable Lower prior folders in Sort priorities and move it before criteria you want it to override. Configure blank and typed input separately.",
					(setting) =>
						setting.addTextArea((text) =>
							text
								.setPlaceholder("Archive\nreference")
								.setValue(plugin.settings.file.demotedPriorFolders.join("\n"))
								.onChange((value) => {
									// Preserve the same path cleanup as exclusions so folder matching stays consistent.
									plugin.settings.file.demotedPriorFolders =
										excludedFolders(value);
									void plugin.saveSettings();
								}),
						),
				),
			]),
			helpers.group("Obsidian-excluded files index", [
				{
					name: "Rebuild Obsidian-excluded files index",
					desc: "Rescan files hidden by Obsidian's Excluded files setting so they are available with the Obsidian-excluded switch.",
					action: () => {
						// Keep index maintenance with the file-search settings because it
						// repairs the cache used by the include-ignored search scope.
						void plugin.fileProvider
							.rebuildIgnoredIndex()
							.then(() => new Notice("Obsidian-excluded files index rebuilt."));
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

function createModesPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(
		"Modes",
		"Type an alias and a space to enter a mode directly, or find the mode on Home. Turn a mode off to hide it from Home and from alias entry.",
		[
			helpers.group(
				"Search modes",
				PALETTE_MODES.map((mode) =>
					helpers.render(mode.title, mode.subtitle, (setting) =>
						renderModeSetting(setting, plugin, mode.id),
					),
				),
			),
		],
	);
}

function createGeneralPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	const highlightRow = (surface: PaletteSurface, name: string, desc: string) =>
		helpers.render(name, desc, (setting) =>
			setting.addToggle((toggle) =>
				toggle
					.setValue(plugin.settings.paletteDisplay[surface].highlightSearchMatches)
					.onChange((value) =>
						plugin.paletteDisplaySettings.setHighlight(surface, value),
					),
			),
		);
	return helpers.page("General", "Home, search history, display, and diagnostics.", [
		helpers.group("Home", [
			helpers.render(
				"Return to Home after",
				"When Open home is used again, resume the last search if it was closed this recently. Immediately always starts at Home. Search text is kept in memory only.",
				(setting) =>
					setting.addDropdown((dropdown) =>
						dropdown
							.addOptions(RETURN_TO_HOME_LABELS)
							.setValue(String(plugin.settings.home.returnAfterSeconds))
							.onChange((value) => {
								plugin.settings.home.returnAfterSeconds = Number(
									value,
								) as ReturnToHomeSeconds;
								void plugin.saveSettings();
							}),
					),
			),
		]),
		helpers.group("Search history", [
			{
				name: "Save searches",
				desc: "Keep committed searches for the search history button.",
				...helpers.control("toggle", "searchHistory.enabled"),
			},
			{
				name: "Save after",
				desc: "Milliseconds a search must stay unchanged before it is saved. 0 saves only searches whose results were used.",
				...helpers.control("slider", "searchHistory.addDelayMs", {
					...SETTING_LIMITS.searchHistory.addDelayMs,
				}),
			},
			{
				name: "Keep for",
				desc: "Days to keep saved searches. 0 keeps them until they are cleared from a palette's ... menu.",
				...helpers.control("slider", "searchHistory.daysToKeep", {
					...SETTING_LIMITS.searchHistory.daysToKeep,
				}),
			},
		]),
		helpers.group("Display", [
			highlightRow(
				"palette",
				"Highlight in palette",
				"Mark the typed text in the palette's results.",
			),
			highlightRow(
				"view",
				"Highlight in sidebar palette",
				"Mark the typed text in the sidebar palette's results.",
			),
			highlightRow(
				"table",
				"Highlight in table palette",
				"Mark the typed text in the table palette's results.",
			),
		]),
		helpers.group("Diagnostics", [
			{
				name: "Show debug messages",
				desc: "Write debug messages to the developer console.",
				...helpers.control("toggle", "showLog"),
			},
		]),
	]);
}

function createIntegrationsPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(
		"Integrations",
		"Turn an integration off to hide its modes from Home and alias entry. Everything has its own settings; the others have none.",
		[
			helpers.group("Integrations", [
				{
					...helpers.render(
						"Everything",
						"Search vault files, including Obsidian-excluded files when the switch is on.",
						(setting) => renderEverythingIntegration(setting, plugin),
					),
					aliases: [...EVERYTHING_MODAL_ITEMS],
				},
				helpers.render(
					"Smart Connections",
					"Related notes, using the embeddings Smart Connections already has.",
					(setting) =>
						renderSmartConnectionsIntegration(
							setting,
							plugin,
							isSmartConnectionsInstalled(plugin.app),
						),
				),
				helpers.render(
					"VS Code",
					"Open Markdown outside the Vault, or hidden by Excluded files, in VS Code instead of Obsidian.",
					(setting) => renderVscodeIntegration(setting, plugin),
				),
			]),
		],
	);
}
