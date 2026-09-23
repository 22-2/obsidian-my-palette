import type MyPalettePlugin from "src/main";
import { PALETTE_VIEW_TYPE, PaletteView } from "src/palette/surfaces/PaletteView";

/**
 * Obsidian event and view registration lives here so `onload` remains a
 * readable lifecycle sequence instead of a collection of unrelated handlers.
 * Why: keep path-copy actions in My Palette menus without adding them to
 * Obsidian's native file menu.
 */
export function registerPluginEvents(plugin: MyPalettePlugin): void {
	plugin.registerView(PALETTE_VIEW_TYPE, (leaf) => new PaletteView(leaf, plugin));
}
