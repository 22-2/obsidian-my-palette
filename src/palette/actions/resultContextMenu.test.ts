import type { App } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { populatePaletteResultMenu } from "src/palette/actions/resultContextMenu";
import type { PaletteResult } from "src/palette/results";

vi.mock("src/palette/resultPresentation", () => ({
	getCopyablePaths: (_app: App, result: PaletteResult) => ({ fileName: result.primary }),
	isCopyablePaletteResult: (result: PaletteResult) =>
		result.mode !== "command" && result.mode !== "search-history",
}));
vi.mock("src/moc-relateds/mocInsertion", () => ({
	addMocInsertionMenuItem: vi.fn(),
	addMocInsertionMenuItems: vi.fn(),
}));
vi.mock("src/palette/actions/selectionHeader", () => ({
	addSelectionHeader: vi.fn(),
}));
vi.mock("src/palette/actions/bulkRenameMenu", () => ({
	addBulkRenameMenuItem: vi.fn(),
}));
vi.mock("src/palette/actions/mergeMenu", () => ({
	addMergeMenuItem: vi.fn(),
}));
vi.mock("src/palette/actions/propertyEditMenu", () => ({
	addPropertyEditMenuItem: vi.fn(),
}));
vi.mock("src/palette/actions/bookmarkMenu", () => ({
	addBookmarkMenuItems: vi.fn(),
}));
vi.mock("src/palette/actions/fileMoveMenu", () => ({
	addFileMoveMenuItem: vi.fn(),
}));
vi.mock("src/tags/tagInsertionMenu", () => ({
	addTagInsertionMenuItems: vi.fn(),
}));
vi.mock("src/tags/tagMenu", () => ({
	populateTagMenu: vi.fn(),
}));
vi.mock("src/platform/pathClipboard", () => ({
	addCopyPathListMenuItems: vi.fn(),
	addCopyPathMenuItems: vi.fn(),
	copyPathListToClipboard: vi.fn(),
	copyPathToClipboard: vi.fn(),
}));
vi.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
	Notice: class {},
}));
vi.mock("src/platform/terminal", () => ({
	getTerminalDirectory: vi.fn(() => "C:/vault"),
	openDirectoryInTerminal: vi.fn().mockResolvedValue(null),
}));
vi.mock("src/platform/externalOpen", async (importOriginal) => {
	const actual = await importOriginal<typeof import("src/platform/externalOpen")>();
	return {
		...actual,
		isDesktopApp: vi.fn(() => true),
		getResultAbsolutePath: vi.fn((_app: App, result: PaletteResult) =>
			result.mode === "command" || result.mode === "search-history"
				? undefined
				: "C:/vault/Note.md",
		),
		isFolderResult: vi.fn(() => false),
		openInExternalEditor: vi.fn().mockResolvedValue(null),
		showInSystemExplorer: vi.fn(),
	};
});

function fixture(popout: boolean) {
	const actions = new Map<string, () => void>();
	const menu = {
		addItem: (configure: (item: unknown) => void) => {
			let title = "";
			const item = {
				setTitle: (value: string) => {
					title = value;
					return item;
				},
				setIcon: () => item,
				onClick: (callback: () => void) => {
					actions.set(title, callback);
					return item;
				},
			};
			configure(item);
		},
		addSeparator: vi.fn(),
		enableFilter: vi.fn(),
	} as unknown as PaletteMenu;
	const result: PaletteResult = {
		id: "note",
		mode: "file",
		primary: "Note",
		secondary: "",
		icon: "file",
		vaultPath: "Note.md",
	};
	const openInMainWindow = vi.fn();
	const options = {
		app: {} as App,
		plugin: {} as MyPalettePlugin,
		menu,
		result,
		selectedItems: [result],
		activate: vi.fn(),
		openInBackground: vi.fn(),
		openInMainWindow: popout ? openInMainWindow : undefined,
		applySearchHistory: vi.fn(),
	};
	return { actions, options, openInMainWindow };
}

it.each([false, true])(
	"offers main-window navigation only for popout menus (popout=%s)",
	(popout) => {
		const f = fixture(popout);
		populatePaletteResultMenu(f.options);
		expect(f.actions.has("メインウィンドウで開く")).toBe(popout);
		if (popout) {
			f.actions.get("メインウィンドウで開く")!();
			expect(f.openInMainWindow).toHaveBeenCalledExactlyOnceWith(f.options.result);
		}
	},
);

it("does not add single-result navigation to bulk selections", () => {
	const f = fixture(true);
	populatePaletteResultMenu({
		...f.options,
		selectedItems: [f.options.result, { ...f.options.result, id: "second", primary: "Second" }],
	});
	expect(f.actions.has("メインウィンドウで開く")).toBe(false);
});

it("does not offer main-window file navigation for commands", () => {
	const f = fixture(true);
	const result: PaletteResult = {
		id: "command",
		mode: "command",
		primary: "Command",
		secondary: "",
		icon: "play",
		commandId: "command",
	};
	populatePaletteResultMenu({ ...f.options, result, selectedItems: [result] });
	expect(f.actions.has("メインウィンドウで開く")).toBe(false);
	expect(f.actions.has("コマンドを実行")).toBe(true);
});

it("offers external open actions for file results on desktop", async () => {
	const f = fixture(false);
	populatePaletteResultMenu({
		...f.options,
		onNoteActionSelected: vi.fn(),
	});
	expect(f.actions.has("外部エディターで開く")).toBe(true);
	expect(f.actions.has("システムのエクスプローラーで表示")).toBe(true);
	expect(f.actions.has("ターミナルで開く")).toBe(true);
	expect(f.actions.has("Show in file explorer")).toBe(false);

	const { openInExternalEditor, showInSystemExplorer } =
		await import("src/platform/externalOpen");
	const { getTerminalDirectory, openDirectoryInTerminal } = await import("src/platform/terminal");
	f.actions.get("外部エディターで開く")!();
	expect(openInExternalEditor).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md");
	f.actions.get("システムのエクスプローラーで表示")!();
	expect(showInSystemExplorer).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md", false);
	f.actions.get("ターミナルで開く")!();
	expect(getTerminalDirectory).toHaveBeenCalledWith("C:/vault/Note.md", false);
	expect(openDirectoryInTerminal).toHaveBeenCalledWith("C:/vault");
});

it("hides external open actions for commands", () => {
	const f = fixture(false);
	const result: PaletteResult = {
		id: "command",
		mode: "command",
		primary: "Command",
		secondary: "",
		icon: "play",
		commandId: "command",
	};
	populatePaletteResultMenu({ ...f.options, result, selectedItems: [result] });
	expect(f.actions.has("外部エディターで開く")).toBe(false);
	expect(f.actions.has("システムのエクスプローラーで表示")).toBe(false);
	expect(f.actions.has("ターミナルで開く")).toBe(false);
});

it("offers editor, explorer and settings for plugin results without note navigation", () => {
	const f = fixture(false);
	const app = {
		setting: { open: vi.fn(), openTabById: vi.fn() },
	} as unknown as App;
	const result: PaletteResult = {
		id: "plugin:alpha",
		mode: "plugin",
		primary: "Alpha Plugin",
		secondary: "alpha 1.0.0",
		icon: "puzzle",
		pluginId: "alpha",
		absolutePath: "C:/vault/cfg/plugins/alpha",
		vaultPath: "cfg/plugins/alpha",
		enabled: true,
		hasSettings: true,
	};
	const onNoteActionSelected = vi.fn();
	populatePaletteResultMenu({
		...f.options,
		app,
		result,
		selectedItems: [result],
		onNoteActionSelected,
	});
	expect(f.actions.has("外部エディターで開く")).toBe(true);
	expect(f.actions.has("システムのエクスプローラーで表示")).toBe(true);
	expect(f.actions.has("ターミナルで開く")).toBe(true);
	expect(f.actions.has("プラグインの設定を開く")).toBe(true);
	expect(f.actions.has("開く")).toBe(false);

	f.actions.get("外部エディターで開く")!();
	expect(f.options.activate).toHaveBeenCalledExactlyOnceWith("primary", result);
	f.actions.get("プラグインの設定を開く")!();
	expect(app.setting.open).toHaveBeenCalledOnce();
	expect(app.setting.openTabById).toHaveBeenCalledExactlyOnceWith("alpha");
	expect(onNoteActionSelected).toHaveBeenCalled();
});

it("offers editor and explorer for snippet results without settings", () => {
	const f = fixture(false);
	const result: PaletteResult = {
		id: "snippet:alpha.css",
		mode: "snippet",
		primary: "alpha",
		secondary: "Enabled",
		icon: "paintbrush",
		snippetName: "alpha.css",
		absolutePath: "C:/vault/cfg/snippets/alpha.css",
		vaultPath: "cfg/snippets/alpha.css",
		isFolder: false,
		enabled: true,
	};
	populatePaletteResultMenu({ ...f.options, result, selectedItems: [result] });
	expect(f.actions.has("外部エディターで開く")).toBe(true);
	expect(f.actions.has("システムのエクスプローラーで表示")).toBe(true);
	expect(f.actions.has("ターミナルで開く")).toBe(true);
	expect(f.actions.has("プラグインの設定を開く")).toBe(false);
	expect(f.actions.has("開く")).toBe(false);
});

it("turns on the action filter for every result menu", () => {
	const f = fixture(false);
	populatePaletteResultMenu(f.options);
	expect(f.options.menu.enableFilter).toHaveBeenCalledOnce();
});

it("adds bookmark actions for the whole selection and refreshes after changes", async () => {
	const { addBookmarkMenuItems } = await import("src/palette/actions/bookmarkMenu");
	const f = fixture(false);
	const onResultsChanged = vi.fn();
	const result: PaletteResult = {
		id: "bookmark:search",
		mode: "bookmark",
		primary: "Query",
		secondary: "",
		icon: "search",
		kind: "search",
		query: "q",
	};
	const second = { ...result, id: "bookmark:search:2" };
	populatePaletteResultMenu({
		...f.options,
		result,
		selectedItems: [result, second],
		onResultsChanged,
	});
	expect(addBookmarkMenuItems).toHaveBeenLastCalledWith(
		expect.objectContaining({
			results: [result, second],
			onBookmarksChanged: onResultsChanged,
		}),
	);
});
