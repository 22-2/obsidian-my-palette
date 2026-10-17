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
import { t } from "src/i18n";

const RETURN_TO_HOME_LABELS: Record<string, string> = {
	"0": t("settings.returnHome.immediately"),
	"30": t("settings.returnHome.after", { seconds: 30 }),
	"60": t("settings.returnHome.after", { seconds: 60 }),
	"90": t("settings.returnHome.after", { seconds: 90 }),
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
import { PALETTE_MODES, isModeIntegrationReady } from "src/palette/modes";
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
 * 最上位は作業の単位で整理する。Obsidian はプラグインの設定を別のウィンドウで開くので、
 * 小さな設定のグループごとにページを作ると、必要な設定を見つけるまでリンクをたどることになるため。
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
	return helpers.page(t("settings.shortcuts.name"), t("settings.shortcuts.desc"), [
		helpers.group(t("settings.shortcuts.group"), [
			helpers.render("", "", (setting) => renderShortcutsTable(setting, plugin)),
		]),
	]);
}

function createFileSearchPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(t("settings.fileSearch.name"), t("settings.fileSearch.desc"), [
		helpers.group(t("settings.fileSearch.fileTypes"), [
			helpers.render(
				t("settings.extensions.name"),
				t("settings.extensions.desc"),
				(setting) =>
					setting.addText((text) =>
						text
							.setPlaceholder(t("settings.extensions.placeholder"))
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
		helpers.group(t("settings.fileSearch.excludedFolders"), [
			helpers.render(
				t("settings.excludedFolders.name"),
				t("settings.excludedFolders.desc"),
				(setting) =>
					setting.addTextArea((text) =>
						text
							.setPlaceholder("Archive\nprivate/diary")
							.setValue(plugin.settings.file.excludedFolders.join("\n"))
							.onChange((value) => {
								// 保存時に正規化して重複を除くことで、表示と検索判定のズレを防ぐ。
								plugin.settings.file.excludedFolders = excludedFolders(value);
								void plugin.saveSettings();
							}),
					),
			),
		]),
		helpers.group(t("settings.fileSearch.demoted"), [
			helpers.render(t("settings.demoted.name"), t("settings.demoted.desc"), (setting) =>
				setting.addTextArea((text) =>
					text
						.setPlaceholder("Archive\nreference")
						.setValue(plugin.settings.file.demotedPriorFolders.join("\n"))
						.onChange((value) => {
							// 除外と同じパスの整理を行い、フォルダーの照合を一貫させる。
							plugin.settings.file.demotedPriorFolders = excludedFolders(value);
							void plugin.saveSettings();
						}),
				),
			),
		]),
		helpers.group(t("settings.fileSearch.ignoredIndex"), [
			{
				name: t("settings.ignoredIndex.name"),
				desc: t("settings.ignoredIndex.desc"),
				action: () => {
					// 索引の保守は、ファイル検索の設定と一緒に置く。除外ファイルを含める検索範囲が使う
					// キャッシュを修復するため。
					void plugin.fileProvider
						.rebuildIgnoredIndex()
						.then(() => new Notice(t("settings.ignoredIndex.done")));
				},
			},
		]),
		helpers.group(t("settings.fileSearch.sorting"), [
			helpers.render(t("settings.sort.name"), t("settings.sort.desc"), (setting) => {
				renderFileSortPriorityControl(setting, plugin.settings.file.sortPriorities, () =>
					plugin.saveSettings(),
				);
			}),
		]),
	]);
}

function createModesPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(t("settings.modes.name"), t("settings.modes.desc"), [
		helpers.group(
			t("settings.modes.group"),
			PALETTE_MODES.map((mode) => ({
				...helpers.render(mode.title, mode.subtitle, (setting) =>
					renderModeSetting(setting, plugin, mode.id),
				),
				visible: () =>
					isModeIntegrationReady(mode.id, plugin.integrationAvailability.current),
			})),
		),
	]);
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
	return helpers.page(t("settings.general.name"), t("settings.general.desc"), [
		helpers.group(t("settings.general.home"), [
			helpers.render(
				t("settings.returnHome.name"),
				t("settings.returnHome.desc"),
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
		helpers.group(t("settings.general.tabs"), [
			{
				name: t("settings.focusTab.name"),
				desc: t("settings.focusTab.desc"),
				...helpers.control("toggle", "focusExistingTab"),
			},
		]),
		helpers.group(t("settings.general.searchHistory"), [
			{
				name: t("settings.saveSearches.name"),
				desc: t("settings.saveSearches.desc"),
				...helpers.control("toggle", "searchHistory.enabled"),
			},
			{
				name: t("settings.saveAfter.name"),
				desc: t("settings.saveAfter.desc"),
				...helpers.control("slider", "searchHistory.addDelayMs", {
					...SETTING_LIMITS.searchHistory.addDelayMs,
				}),
			},
			{
				name: t("settings.keepFor.name"),
				desc: t("settings.keepFor.desc"),
				...helpers.control("slider", "searchHistory.daysToKeep", {
					...SETTING_LIMITS.searchHistory.daysToKeep,
				}),
			},
		]),
		helpers.group(t("settings.general.display"), [
			highlightRow(
				"palette",
				t("settings.highlightPalette.name"),
				t("settings.highlightPalette.desc"),
			),
			highlightRow(
				"view",
				t("settings.highlightView.name"),
				t("settings.highlightView.desc"),
			),
			highlightRow(
				"table",
				t("settings.highlightTable.name"),
				t("settings.highlightTable.desc"),
			),
		]),
		helpers.group(t("settings.general.diagnostics"), [
			{
				name: t("settings.debug.name"),
				desc: t("settings.debug.desc"),
				...helpers.control("toggle", "showLog"),
			},
		]),
	]);
}

function createIntegrationsPage(plugin: SettingsHost, helpers: SettingPageHelpers): PageItem {
	return helpers.page(t("settings.integrations.name"), t("settings.integrations.desc"), [
		helpers.group(t("settings.integrations.group"), [
			{
				...helpers.render(
					t("settings.everything.name"),
					t("settings.everything.desc"),
					(setting) => renderEverythingIntegration(setting, plugin),
				),
				aliases: [...EVERYTHING_MODAL_ITEMS],
			},
			helpers.render(t("settings.smart.name"), t("settings.smart.desc"), (setting) =>
				renderSmartConnectionsIntegration(
					setting,
					plugin,
					isSmartConnectionsInstalled(plugin.app),
				),
			),
			helpers.render(t("settings.vscode.name"), t("settings.vscode.desc"), (setting) =>
				renderVscodeIntegration(setting, plugin),
			),
		]),
	]);
}
