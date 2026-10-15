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
vi.mock("src/palette/actions/propertyEditMenu", () => ({
	addPropertyEditMenuItem: vi.fn(),
}));
vi.mock("src/palette/actions/fileMoveMenu", () => ({
	addFileMoveMenuItem: vi.fn(),
}));
vi.mock("src/tags/tagInsertionMenu", () => ({
	addTagInsertionMenuItems: vi.fn(),
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
		expect(f.actions.has("Open in main window")).toBe(popout);
		if (popout) {
			f.actions.get("Open in main window")!();
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
	expect(f.actions.has("Open in main window")).toBe(false);
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
	expect(f.actions.has("Open in main window")).toBe(false);
	expect(f.actions.has("Run command")).toBe(true);
});

it("offers external open actions for file results on desktop", async () => {
	const f = fixture(false);
	populatePaletteResultMenu({
		...f.options,
		onNoteActionSelected: vi.fn(),
	});
	expect(f.actions.has("Open in external editor")).toBe(true);
	expect(f.actions.has("Show in system explorer")).toBe(true);
	expect(f.actions.has("Open in terminal")).toBe(true);
	expect(f.actions.has("Show in file explorer")).toBe(false);

	const { openInExternalEditor, showInSystemExplorer } =
		await import("src/platform/externalOpen");
	const { getTerminalDirectory, openDirectoryInTerminal } = await import("src/platform/terminal");
	f.actions.get("Open in external editor")!();
	expect(openInExternalEditor).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md");
	f.actions.get("Show in system explorer")!();
	expect(showInSystemExplorer).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md", false);
	f.actions.get("Open in terminal")!();
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
	expect(f.actions.has("Open in external editor")).toBe(false);
	expect(f.actions.has("Show in system explorer")).toBe(false);
	expect(f.actions.has("Open in terminal")).toBe(false);
});

it("offers editor, explorer and settings for plugin results without note navigation", () => {
	const f = fixture(false);
	const app = {
		setting: { openTabById: vi.fn() },
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
	expect(f.actions.has("Open in external editor")).toBe(true);
	expect(f.actions.has("Show in system explorer")).toBe(true);
	expect(f.actions.has("Open in terminal")).toBe(true);
	expect(f.actions.has("Open plugin settings")).toBe(true);
	expect(f.actions.has("Open")).toBe(false);

	f.actions.get("Open in external editor")!();
	expect(f.options.activate).toHaveBeenCalledExactlyOnceWith("primary", result);
	f.actions.get("Open plugin settings")!();
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
	expect(f.actions.has("Open in external editor")).toBe(true);
	expect(f.actions.has("Show in system explorer")).toBe(true);
	expect(f.actions.has("Open in terminal")).toBe(true);
	expect(f.actions.has("Open plugin settings")).toBe(false);
	expect(f.actions.has("Open")).toBe(false);
});

it("turns on the action filter for every result menu", () => {
	const f = fixture(false);
	populatePaletteResultMenu(f.options);
	expect(f.options.menu.enableFilter).toHaveBeenCalledOnce();
});
