import type MyPalettePlugin from "src/main";
import { insertLinkToMocRelateds, removeLinkInMocRelateds } from "src/moc-relateds/mocRelateds";
import { MoveFileModal } from "src/palette/MoveFileModal";
import { BulkRenameModal } from "src/rename/BulkRenameModal";
import { MergeTargetModal } from "src/merge/MergeTargetModal";
import type { FixedPaletteMode } from "src/palette/PaletteSearchSession";
import { insertTags } from "src/tags/insertTags";
import { t } from "src/i18n";

/**
 * コマンドの定義は Plugin クラスの外に置く。ライフサイクルの処理と、
 * コマンドを使えるかどうかの判定を別々に変えられるようにするため。
 */
export function registerPluginCommands(plugin: MyPalettePlugin): void {
	// Why: モードから Esc を押すと Home に戻るため、モードを開くすべての経路で
	// モードの一覧も表示する。
	const openWithHome = (input: string, fixedMode?: FixedPaletteMode) =>
		plugin.paletteOpener.openPalette(input, fixedMode, { modeEntries: true });
	plugin.addCommand({
		id: "open-home",
		name: t("command.openHome"),
		// Home は空の状態で始まり、ファイルの上にモードの一覧を出す。
		callback: () => plugin.paletteOpener.openHomePalette(),
	});
	plugin.addCommand({
		id: "open-note-list",
		name: t("command.openNoteList"),
		// Notes は Obsidian の標準ファイル検索。findPaletteMode("file") は
		// PALETTE_MODES で最初のファイルモードなので、これに解決される。
		callback: () => openWithHome("", "file"),
	});
	plugin.addCommand({
		id: "open-run-list",
		name: t("command.openRunList"),
		callback: () => openWithHome(plugin.paletteOpener.commandPaletteInitialInput()),
	});
	plugin.addCommand({
		id: "open-everything-list",
		name: t("command.openEverythingList"),
		callback: () => openWithHome(`${plugin.settings.modes.everything.alias} `),
	});
	plugin.addCommand({
		id: "open-sidebar-palette",
		name: t("command.openSidebarPalette"),
		callback: () => void plugin.paletteOpener.openPaletteView(),
	});
	// Why: 表の検索は既存のパレットの表示切り替えではなく、専用の入口を持つ。
	// 追加のペインは各ペインのメニューから引き続き開ける。
	plugin.addCommand({
		id: "open-table-palette",
		name: t("command.openTablePalette"),
		callback: () => void plugin.paletteOpener.openPaletteTableView(),
	});
	plugin.addCommand({
		id: "open-outgoing-link-list",
		name: t("command.openOutgoingLinkList"),
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openWithHome("", "link");
		},
	});
	plugin.addCommand({
		id: "open-backlink-list",
		name: t("command.openBacklinkList"),
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openWithHome("", "backlink");
		},
	});
	plugin.addCommand({
		id: "open-bookmark-list",
		name: t("command.openBookmarkList"),
		callback: () => openWithHome("", "bookmark"),
	});
	plugin.addCommand({
		id: "open-smart-connections-list",
		name: t("command.openSmartConnectionsList"),
		checkCallback: (checking) => {
			if (checking) return Boolean(plugin.app.workspace.getActiveFile());
			openWithHome("", "smart");
		},
	});
	plugin.addCommand({
		id: "open-folder-move-selector",
		name: t("command.openFolderMoveSelector"),
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (checking) return Boolean(file);
			if (file) new MoveFileModal(plugin, file).open();
		},
	});
	plugin.addCommand({
		id: "open-rename-selector",
		name: t("command.openRenameSelector"),
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (checking) return Boolean(file);
			if (file) new BulkRenameModal(plugin, [file]).open();
		},
	});
	plugin.addCommand({
		id: "open-merge-selector",
		name: t("command.openMergeSelector"),
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			if (checking) return Boolean(file && file.extension === "md");
			if (file && file.extension === "md") new MergeTargetModal(plugin, [file]).open();
		},
	});
	plugin.addCommand({
		id: "open-tab-list",
		name: t("command.openTabList"),
		callback: () => openWithHome("", "tab"),
	});
	plugin.addCommand({
		id: "open-plugin-list",
		name: t("command.openPluginList"),
		callback: () => openWithHome(`${plugin.settings.modes.plugins.alias} `),
	});
	plugin.addCommand({
		id: "open-snippet-list",
		name: t("command.openSnippetList"),
		callback: () => openWithHome(`${plugin.settings.modes.snippets.alias} `),
	});
	plugin.addCommand({
		id: "open-property-list",
		name: t("command.openPropertyList"),
		callback: () => openWithHome(`${plugin.settings.modes.properties.alias} `),
	});
	plugin.addCommand({
		id: "open-vault-audit-list",
		name: t("command.openVaultAuditList"),
		callback: () => void plugin.paletteOpener.openAuditTable(),
	});
	plugin.addCommand({
		id: "open-tag-insert-selector",
		name: t("command.openTagInsertSelector"),
		checkCallback: (checking) => {
			const file = plugin.app.workspace.getActiveFile();
			const canRun = file?.extension === "md";
			if (checking) return canRun;
			if (file && canRun) void insertTags(plugin, [file]);
		},
	});
	plugin.addCommand({
		id: "open-moc-insert-selector",
		name: t("command.openMocInsertSelector"),
		checkCallback: (checking) => {
			const canRun = Boolean(plugin.app.workspace.getActiveFile());
			if (checking) return canRun;
			void insertLinkToMocRelateds(plugin);
		},
	});
	plugin.addCommand({
		id: "open-moc-remove-selector",
		name: t("command.openMocRemoveSelector"),
		checkCallback: (checking) => {
			const canRun = Boolean(plugin.app.workspace.getActiveFile());
			if (checking) return canRun;
			void removeLinkInMocRelateds(plugin);
		},
	});
}
