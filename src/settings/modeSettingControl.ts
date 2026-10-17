import type { Setting } from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import {
	getPaletteMode,
	isModeIntegrationOn,
	validateModeAlias,
	type PaletteModeId,
} from "src/palette/modes";
import { t } from "src/i18n";

/**
 * 設定の「モード」ページの1つのモード: エイリアスと、オン/オフのスイッチ。標準の行に置くので、
 * タイトルと副題が検索できたままになる。不正なエイリアスは行の下に表示し、保存しない。
 */
export function renderModeSetting(setting: Setting, plugin: SettingsHost, id: PaletteModeId): void {
	const mode = getPaletteMode(id);
	const errorEl = setting.infoEl.createDiv({
		cls: "my-palette-mode-error",
		attr: { role: "alert" },
	});
	const showError = (message: string | undefined) => {
		errorEl.textContent = message ?? "";
		errorEl.toggleAttribute("hidden", message === undefined);
	};
	showError(undefined);
	const integrationOn = isModeIntegrationOn(id, plugin.settings);
	if (!integrationOn) {
		setting.settingEl.addClass("is-unavailable");
		setting.infoEl.createDiv({
			cls: "my-palette-mode-note",
			text: t("settings.mode.integrationOff"),
		});
	}

	setting.addText((text) => {
		text.setValue(plugin.settings.modes[id].alias);
		text.inputEl.addClass("my-palette-mode-alias");
		text.inputEl.setAttribute(
			"aria-label",
			t("settings.mode.aliasLabel", { title: mode.title }),
		);
		text.onChange(async (value) => {
			const error = validateModeAlias(id, value, plugin.settings.modes);
			showError(error);
			if (error) return;
			plugin.settings.modes[id].alias = value.trim();
			await plugin.saveSettings();
		});
	});
	setting.addToggle((toggle) => {
		toggle
			.setValue(plugin.settings.modes[id].enabled)
			.setTooltip(t("settings.mode.toggleTooltip", { title: mode.title }))
			.setDisabled(!integrationOn)
			.onChange(async (value) => {
				plugin.settings.modes[id].enabled = value;
				await plugin.saveSettings();
			});
	});
}
