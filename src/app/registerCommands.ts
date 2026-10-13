import { Notice } from "obsidian";
import type MyPalettePlugin from "src/main";
import { insertLinkToMocRelateds, removeLinkInMocRelateds } from "src/moc-relateds/mocRelateds";
import { MoveFileModal } from "src/palette/MoveFileModal";
import { OpenFilePathModal } from "src/palette/OpenFilePathModal";
import type { FixedPaletteMode } from "src/palette/PaletteSearchSession";
import { insertTags } from "src/tags/insertTags";

/**
 * Command definitions are kept outside the Plugin class so lifecycle code and
 * command availability rules can evolve independently.
 */
export function registerPluginCommands(plugin: MyPalettePlugin): void {
	// Why: Esc from a mode returns to Root Search, so every path that opens a mode
	// lists the modes too. The file-only palette ("open") is the exception.
	const openRoot = (input: string, fixedMode?: FixedPaletteMode) =>
		plugin.paletteOpener.openPalette(input, fixedMode, { modeEntries: true });
	plugin.addCommand({
		id: "open-root",
		name: "Open palette",
		// Root Search starts empty, like a launcher, and lists modes above files.
		callback: () => plugin.paletteOpener.openRootPalette(),
	});
	plugin.addCommand({
		id: "open",
		name: "Open recent palette",
		callback: () => plugin.paletteOpener.openPalette(),
	});
	plugin.addCommand({
		id: "open-run-list",
		name: "Open run list",
		callback: () => openRoot(plugin.paletteOpener.commandPaletteInitialInput()),
	});
	plugin.addCommand({
		id: "open-view",
		name: "Open palette in right sidebar",
		callback: () => void plugin.paletteOpener.openPaletteView(),
	});
	// Why: table search has its own entry point rather than a presentation toggle
	// in the existing palette. Additional panes remain available in each pane menu.
	plugin.addCommand({
		id: "open-table-view",
		name: "Open palette table in center",
		callback: () => void plugin.paletteOpener.openPaletteTableView(),
	});
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
			openRoot("", "link");
		},
	});
	plugin.addCommand({
		id: "backlink-search",
		name: "Backlink search",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openRoot("", "backlink");
		},
	});
	plugin.addCommand({
		id: "bookmark-search",
		name: "Bookmark search",
		callback: () => openRoot("", "bookmark"),
	});
	plugin.addCommand({
		id: "smart-connections-search",
		name: "Smart Connections search",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openRoot("", "smart");
		},
	});
	plugin.addCommand({
		id: "move-file-to-another-folder",
		name: "Move file to another folder",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (checking) return Boolean(file);
			if (file) new MoveFileModal(plugin, file).open();
		},
	});
	plugin.addCommand({
		id: "switch-tab",
		name: "Switch tab",
		callback: () => openRoot("", "tab"),
	});
	plugin.addCommand({
		id: "open-file-path-in-editor",
		name: "Open file path in editor",
		callback: () => new OpenFilePathModal(plugin).open(),
	});
	plugin.addCommand({
		id: "insert-tags",
		name: "Insert tags into current note",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			const canRun = file?.extension === "md";
			if (checking) return canRun;
			if (file && canRun) void insertTags(plugin, [file]);
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
	plugin.addCommand({
		id: "remove-link-in-moc-relateds",
		name: "Remove link in MOC Relateds",
		checkCallback: (checking) => {
			const canRun = Boolean(plugin.app.workspace.getActiveFile());
			if (checking) return canRun;
			void removeLinkInMocRelateds(plugin);
		},
	});
}
