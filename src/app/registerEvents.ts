import type MyPalettePlugin from "src/main";
import {
	EXTERNAL_MARKDOWN_VIEW_TYPE,
	ExternalMarkdownView,
} from "src/workspace/external-markdown/ExternalMarkdownView";
import { PALETTE_VIEW_TYPE, PaletteView } from "src/palette/surfaces/PaletteView";
import { getVaultFullPath } from "src/ignored-notes/ignoredPaths";
import { addCopyPathMenuItems, copyPathToClipboard } from "src/platform/pathClipboard";

/**
 * Obsidian event and view registration lives here so `onload` remains a
 * readable lifecycle sequence instead of a collection of unrelated handlers.
 */
export function registerPluginEvents(plugin: MyPalettePlugin): void {
	plugin.registerView(EXTERNAL_MARKDOWN_VIEW_TYPE, (leaf) => new ExternalMarkdownView(leaf));
	plugin.registerView(PALETTE_VIEW_TYPE, (leaf) => new PaletteView(leaf, plugin));
	plugin.registerEvent(
		plugin.app.workspace.on("file-menu", (menu, file) => {
			const absolutePath = getVaultFullPath(plugin.app, file.path);
			addCopyPathMenuItems(
				menu,
				{ relativePath: file.path, absolutePath: absolutePath ?? undefined },
				(path) => void copyPathToClipboard(path),
			);
		}),
	);
}
