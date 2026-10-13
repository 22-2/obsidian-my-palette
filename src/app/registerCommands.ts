import type MyPalettePlugin from "src/main";
import { insertLinkToMocRelateds, removeLinkInMocRelateds } from "src/moc-relateds/mocRelateds";
import { MoveFileModal } from "src/palette/MoveFileModal";
import type { FixedPaletteMode } from "src/palette/PaletteSearchSession";
import { insertTags } from "src/tags/insertTags";

/**
 * Command definitions are kept outside the Plugin class so lifecycle code and
 * command availability rules can evolve independently.
 */
export function registerPluginCommands(plugin: MyPalettePlugin): void {
	// Why: Esc from a mode returns to Home, so every path that opens a mode
	// lists the modes too.
	const openWithHome = (input: string, fixedMode?: FixedPaletteMode) =>
		plugin.paletteOpener.openPalette(input, fixedMode, { modeEntries: true });
	plugin.addCommand({
		id: "open-home",
		name: "Open home",
		// Home starts empty and lists modes above files.
		callback: () => plugin.paletteOpener.openHomePalette(),
	});
	plugin.addCommand({
		id: "open-note-list",
		name: "Open note list",
		// Notes is the built-in Obsidian file search; findPaletteMode("file")
		// resolves to it because it is the first file mode in PALETTE_MODES.
		callback: () => openWithHome("", "file"),
	});
	plugin.addCommand({
		id: "open-run-list",
		name: "Open run list",
		callback: () => openWithHome(plugin.paletteOpener.commandPaletteInitialInput()),
	});
	plugin.addCommand({
		id: "open-sidebar-palette",
		name: "Open sidebar palette",
		callback: () => void plugin.paletteOpener.openPaletteView(),
	});
	// Why: table search has its own entry point rather than a presentation toggle
	// in the existing palette. Additional panes remain available in each pane menu.
	plugin.addCommand({
		id: "open-table-palette",
		name: "Open table palette",
		callback: () => void plugin.paletteOpener.openPaletteTableView(),
	});
	plugin.addCommand({
		id: "open-outgoing-link-list",
		name: "Open outgoing link list",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openWithHome("", "link");
		},
	});
	plugin.addCommand({
		id: "open-backlink-list",
		name: "Open backlink list",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openWithHome("", "backlink");
		},
	});
	plugin.addCommand({
		id: "open-bookmark-list",
		name: "Open bookmark list",
		callback: () => openWithHome("", "bookmark"),
	});
	plugin.addCommand({
		id: "open-smart-connections-list",
		name: "Open Smart Connections list",
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openWithHome("", "smart");
		},
	});
	plugin.addCommand({
		id: "open-folder-move-selector",
		name: "Open folder move selector",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (checking) return Boolean(file);
			if (file) new MoveFileModal(plugin, file).open();
		},
	});
	plugin.addCommand({
		id: "open-tab-list",
		name: "Open tab list",
		callback: () => openWithHome("", "tab"),
	});
	plugin.addCommand({
		id: "open-tag-insert-selector",
		name: "Open tag insert selector",
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			const canRun = file?.extension === "md";
			if (checking) return canRun;
			if (file && canRun) void insertTags(plugin, [file]);
		},
	});
	plugin.addCommand({
		id: "open-moc-insert-selector",
		name: "Open MOC insert selector",
		checkCallback: (checking) => {
			const canRun = Boolean(plugin.app.workspace.getActiveFile());
			if (checking) return canRun;
			void insertLinkToMocRelateds(plugin);
		},
	});
	plugin.addCommand({
		id: "open-moc-remove-selector",
		name: "Open MOC remove selector",
		checkCallback: (checking) => {
			const canRun = Boolean(plugin.app.workspace.getActiveFile());
			if (checking) return canRun;
			void removeLinkInMocRelateds(plugin);
		},
	});
}
