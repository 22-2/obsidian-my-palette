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
	expect(f.actions.has("Show in file explorer")).toBe(false);

	const { openInExternalEditor, showInSystemExplorer } =
		await import("src/platform/externalOpen");
	f.actions.get("Open in external editor")!();
	expect(openInExternalEditor).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md");
	f.actions.get("Show in system explorer")!();
	expect(showInSystemExplorer).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md", false);
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
});
