import type { PaletteMenu } from "src/ui/paletteMenu";
import { ICONS } from "src/ui/icons";

/**
 * Adds a disabled first row that names how many results the menu acts on, so each
 * action's title can stay count-free. Single results need no header.
 */
export function addSelectionHeader(menu: PaletteMenu, count: number): void {
	if (count < 2) return;
	menu.addItem((item) =>
		item.setTitle(`${count} items selected`).setIcon(ICONS.selection).setDisabled(true),
	);
	menu.addSeparator();
}
