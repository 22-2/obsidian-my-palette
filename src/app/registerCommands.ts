import { Notice } from "obsidian";
import type MyPalettePlugin from "src/main";
import { insertLinkToMocRelateds } from "src/moc-relateds/mocRelateds";
import { MoveFileModal } from "src/palette/MoveFileModal";

/**
 * Command definitions are kept outside the Plugin class so lifecycle code and
 * command availability rules can evolve independently.
 */
export function registerPluginCommands(plugin: MyPalettePlugin): void {
	plugin.addCommand({
		id: "open",
		name: "Open Recent palette",
		callback: () => plugin.openPalette(plugin.getRememberedPaletteQuery("file")),
	});
	plugin.addCommand({
		id: "open-command-list",
		name: "Open command list",
		callback: () => plugin.openPalette(plugin.commandPaletteInitialInput()),
	});
	plugin.addCommand({
		id: "open-view",
		name: "Open palette in right sidebar",
		callback: () => void plugin.openPaletteView(plugin.getRememberedPaletteQuery("file")),
	});
	// Why: one command keeps the command palette discoverable; independent
	// additional sidebar views remain available from the view pane menu.
	plugin.addCommand({
		id: "show-current-line-number",
		name: "Show current line number",
		checkCallback: (checking) => {
			const editor = plugin.app.workspace.activeEditor?.editor;
			if (checking) return Boolean(editor);
			if (editor) new Notice(`Line ${editor.getCursor().line + 1}`);
		},
	});
	plugin.addCommand({
		id: "link-search",
		name: "Link search",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			plugin.openPalette("", "link");
		},
	});
	plugin.addCommand({
		id: "backlink-search",
		name: "Backlink search",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			plugin.openPalette("", "backlink");
		},
	});
	plugin.addCommand({
		id: "bookmark-search",
		name: "Bookmark search",
		callback: () => plugin.openPalette("", "bookmark"),
	});
	plugin.addCommand({
		id: "smart-connections-search",
		name: "Smart Connections search",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			plugin.openPalette("", "smart");
		},
	});
	plugin.addCommand({
		id: "move-file-to-another-folder",
		name: "Move file to another folder",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (checking) return Boolean(file);
			if (file) new MoveFileModal(plugin.app, file).open();
		},
	});
	plugin.addCommand({
		id: "insert-link-to-moc-relateds",
		name: "Insert link to MOC Relateds",
		checkCallback: (checking) => {
			const canRun = Boolean(plugin.app.workspace.getActiveFile());
			if (checking) return canRun;
			void insertLinkToMocRelateds(plugin);
		},
	});
}
