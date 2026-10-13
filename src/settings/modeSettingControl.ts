import type { Setting } from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import { getPaletteMode, validateModeAlias, type PaletteModeId } from "src/palette/modes";

/**
 * One mode on the Modes page: its alias and an on/off switch, in a standard row so
 * its title and subtitle stay searchable. An invalid alias is reported under the row
 * and is not saved.
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

	setting.addText((text) => {
		text.setValue(plugin.settings.modes[id].alias);
		text.inputEl.addClass("my-palette-mode-alias");
		text.inputEl.setAttribute("aria-label", `${mode.title} alias`);
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
			.setTooltip(`Show ${mode.title} in Root Search`)
			.onChange(async (value) => {
				plugin.settings.modes[id].enabled = value;
				await plugin.saveSettings();
			});
	});
}
