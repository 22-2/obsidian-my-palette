import { supportsIncludeIgnored, type PaletteMode } from "src/palette/results";
import type { PaletteHotkey } from "src/ui/hotkeys";
import type { StatusToggle, StatusToggleOptions } from "src/ui/statusToggle";

/** Footer switch for the Obsidian-excluded scope, shared by every file-search surface. */
export function ignoredToggleOptions(
	value: boolean,
	onChange: (value: boolean) => void,
	hotkey: () => PaletteHotkey | null,
): StatusToggleOptions {
	return {
		id: "include-ignored",
		label: "Obsidian-excluded",
		hotkey,
		description: "Include files hidden by Obsidian's Excluded files setting",
		value,
		onChange,
	};
}

/** The switch is shown only where File search can use it; other modes never list Obsidian-excluded files. */
export function syncIgnoredToggle(toggle: StatusToggle | undefined, mode: PaletteMode): void {
	toggle?.setHidden(!supportsIncludeIgnored(mode));
}
