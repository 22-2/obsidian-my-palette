import { supportsIncludeIgnored, type PaletteMode } from "src/palette/results";
import type { PanelSwitch, PanelSwitchOptions } from "src/ui/panelSwitch";
import { ICONS } from "src/ui/icons";

/** Option for the Obsidian-excluded scope, shared by every file-search surface. */
export function ignoredToggleOptions(
	value: boolean,
	onChange: (value: boolean) => void,
): PanelSwitchOptions {
	return {
		id: "include-ignored",
		label: "Include Obsidian-excluded files",
		icon: ICONS.includeExcluded,
		description: "Include files hidden by Obsidian's Excluded files setting",
		value,
		onChange,
	};
}

/** The option is shown in File search and Everything, where it changes the search scope. */
export function syncIgnoredToggle(toggle: PanelSwitch | undefined, mode: PaletteMode): void {
	toggle?.setHidden(!supportsIncludeIgnored(mode));
}
