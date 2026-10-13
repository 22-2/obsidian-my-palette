import { supportsIncludeIgnored, type PaletteMode } from "src/palette/results";
import type { PaletteHotkey } from "src/ui/hotkeys";
import type { StatusToggle, StatusToggleOptions } from "src/ui/statusToggle";

/** Ctrl+I flips the Ignored switch in every file search surface. */
export const IGNORED_HOTKEY: PaletteHotkey = { key: "I", modifiers: ["Ctrl"] };

export const IGNORED_SHORTCUT = [
	"Ctrl+I",
	"Toggle including files hidden by Obsidian's Excluded files setting",
] as const;

/** Footer switch for the ignored-note scope, shared by every file-search surface. */
export function ignoredToggleOptions(
	value: boolean,
	onChange: (value: boolean) => void,
): StatusToggleOptions {
	return {
		id: "include-ignored",
		label: "Ignored",
		hotkey: () => IGNORED_HOTKEY,
		description: "Include files hidden by Obsidian's Excluded files setting",
		value,
		onChange,
	};
}

/** The switch is shown only where File search can use it; other modes never list ignored notes. */
export function syncIgnoredToggle(toggle: StatusToggle | undefined, mode: PaletteMode): void {
	toggle?.setHidden(!supportsIncludeIgnored(mode));
}
