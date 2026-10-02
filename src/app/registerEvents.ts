import type MyPalettePlugin from "src/main";
import { PaletteView } from "src/palette/surfaces/PaletteView";
import { PaletteTableView } from "src/palette/surfaces/PaletteTableView";
import { PALETTE_VIEW_TYPE, PALETTE_TABLE_VIEW_TYPE } from "src/palette/surfaces/paletteViewTypes";

/**
 * Obsidian event and view registration lives here so `onload` remains a
 * readable lifecycle sequence instead of a collection of unrelated handlers.
 * Why: keep path-copy actions in My Palette menus without adding them to
 * Obsidian's native file menu.
 */
export function registerPluginEvents(plugin: MyPalettePlugin): void {
	plugin.registerView(PALETTE_VIEW_TYPE, (leaf) => new PaletteView(leaf, plugin));
	// Why: separate types let each command reuse its own pane and Obsidian restore
	// list and table searches independently in the same workspace.
	plugin.registerView(PALETTE_TABLE_VIEW_TYPE, (leaf) => new PaletteTableView(leaf, plugin));
}
