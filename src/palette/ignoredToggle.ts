import { supportsIncludeIgnored, type PaletteMode } from "src/palette/results";
import type { PanelSwitch, PanelSwitchOptions } from "src/ui/panelSwitch";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** Obsidian の除外ファイルの範囲のオプション。ファイル検索の画面すべてで共有する。 */
export function ignoredToggleOptions(
	value: boolean,
	onChange: (value: boolean) => void,
): PanelSwitchOptions {
	return {
		id: "include-ignored",
		label: t("palette.ignored.label"),
		icon: ICONS.includeExcluded,
		description: t("palette.ignored.description"),
		value,
		onChange,
	};
}

/** このオプションは、範囲を変えるファイル検索、Everything、Vault 監査で表示する。 */
export function syncIgnoredToggle(toggle: PanelSwitch | undefined, mode: PaletteMode): void {
	toggle?.setHidden(!supportsIncludeIgnored(mode));
}
