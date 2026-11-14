import type { App } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { populatePaletteResultMenu } from "src/features/palette/actions/resultContextMenu";
import type { PaletteResult } from "src/core/results";

vi.mock("src/features/palette/resultPresentation", () => ({
	getCopyablePaths: (_app: App, result: PaletteResult) => ({ fileName: result.primary }),
	isCopyablePaletteResult: (result: PaletteResult) =>
		result.mode !== "command" && result.mode !== "search-history",
}));
vi.mock("src/features/moc-relateds/mocInsertion", () => ({
	addMocInsertionMenuItem: vi.fn(),
	addMocInsertionMenuItems: vi.fn(),
}));
vi.mock("src/features/palette/actions/selectionHeader", () => ({
	addSelectionHeader: vi.fn(),
}));
vi.mock("src/features/palette/actions/bulkRenameMenu", () => ({
	addBulkRenameMenuItem: vi.fn(),
}));
vi.mock("src/features/palette/actions/mergeMenu", () => ({
	addMergeMenuItem: vi.fn(),
}));
vi.mock("src/features/palette/actions/propertyEditMenu", () => ({
	addPropertyEditMenuItem: vi.fn(),
}));
vi.mock("src/features/palette/actions/bookmarkMenu", () => ({
	addBookmarkMenuItems: vi.fn(),
}));
vi.mock("src/features/palette/actions/fileMoveMenu", () => ({
	addFileMoveMenuItem: vi.fn(),
}));
vi.mock("src/ui/confirmPalette", () => ({
	openConfirmPalette: vi.fn(),
}));
vi.mock("src/features/palette/actions/fileDeleteMenu", () => ({
	addFileDeleteMenuItem: vi.fn(),
}));
vi.mock("src/features/tags/tagInsertionMenu", () => ({
	addTagInsertionMenuItems: vi.fn(),
}));
vi.mock("src/features/tags/tagMenu", () => ({
	populateTagMenu: vi.fn(),
}));
vi.mock("src/ui/pathClipboard", () => ({
	addCopyPathListSubmenu: vi.fn(),
	addCopyPathSubmenu: vi.fn(),
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

/** 区切り線を表す、並びの記録の印。 */
const SEPARATOR = "---";

function fixture(popout: boolean) {
	const actions = new Map<string, () => void>();
	/** 並びの記録。ルートのメニューの項目名と区切り線が順に入る。 */
	const titles: string[] = [];
	/** サブメニューを開く項目の名前ごとの、サブメニューの項目名。 */
	const submenus = new Map<string, string[]>();
	function fakeMenu(record: string[]): PaletteMenu {
		return {
			addItem: (configure: (item: unknown) => void) => {
				let title = "";
				const item = {
					setTitle: (value: string) => {
						title = value;
						record.push(value);
						return item;
					},
					setIcon: () => item,
					setAccessKey: () => item,
					setSubmenu: () => {
						const children: string[] = [];
						submenus.set(title, children);
						return fakeMenu(children);
					},
					onClick: (callback: () => void) => {
						actions.set(title, callback);
						return item;
					},
				};
				configure(item);
			},
			addSeparator: () => void record.push(SEPARATOR),
			enableFilter: vi.fn(),
		} as unknown as PaletteMenu;
	}
	const menu = fakeMenu(titles);
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
	/** 区切り線で分けたグループごとの項目名。空のグループは、実際のメニューでは線が引かれないので除く。 */
	const groups = () =>
		titles
			.join("\n")
			.split(SEPARATOR)
			.map((group) => group.split("\n").filter(Boolean))
			.filter((group) => group.length > 0);
	return { actions, options, openInMainWindow, groups, submenus };
}

/** メニューを組み立てる各ヘルパーを、自分の名前の項目を1つ加えるだけのものにして、並びだけを見られるようにする。 */
async function stubEditingHelpers() {
	const named =
		(title: string) =>
		(menu: PaletteMenu): void =>
			void menu.addItem((item) => item.setTitle(title));
	const mocks = {
		move: await import("src/features/palette/actions/fileMoveMenu"),
		rename: await import("src/features/palette/actions/bulkRenameMenu"),
		properties: await import("src/features/palette/actions/propertyEditMenu"),
		tags: await import("src/features/tags/tagInsertionMenu"),
		moc: await import("src/features/moc-relateds/mocInsertion"),
		bookmark: await import("src/features/palette/actions/bookmarkMenu"),
		merge: await import("src/features/palette/actions/mergeMenu"),
		remove: await import("src/features/palette/actions/fileDeleteMenu"),
		copy: await import("src/ui/pathClipboard"),
	};
	vi.mocked(mocks.move.addFileMoveMenuItem).mockImplementation(named("移動…"));
	vi.mocked(mocks.rename.addBulkRenameMenuItem).mockImplementation(named("名前を変更…"));
	vi.mocked(mocks.properties.addPropertyEditMenuItem).mockImplementation(
		named("プロパティを編集…"),
	);
	vi.mocked(mocks.tags.addTagInsertionMenuItems).mockImplementation(named("タグを追加…"));
	vi.mocked(mocks.moc.addMocInsertionMenuItem).mockImplementation(
		named("MOC の Relateds に挿入"),
	);
	vi.mocked(mocks.moc.addMocInsertionMenuItems).mockImplementation(
		named("MOC の Relateds に挿入"),
	);
	vi.mocked(mocks.bookmark.addBookmarkMenuItems).mockImplementation(({ menu }) =>
		named("ブックマークに追加…")(menu),
	);
	vi.mocked(mocks.merge.addMergeMenuItem).mockImplementation(named("マージ…"));
	vi.mocked(mocks.remove.addFileDeleteMenuItem).mockImplementation((_app, menu) =>
		named("ノートを削除")(menu),
	);
	vi.mocked(mocks.copy.addCopyPathSubmenu).mockImplementation(named("パスをコピー"));
	vi.mocked(mocks.copy.addCopyPathListSubmenu).mockImplementation(named("パスをコピー"));
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

it("単一結果のナビゲーションを一括選択に追加しません", () => {
	const f = fixture(true);
	populatePaletteResultMenu({
		...f.options,
		selectedItems: [f.options.result, { ...f.options.result, id: "second", primary: "Second" }],
	});
	expect(f.actions.has("メインウィンドウで開く")).toBe(false);
});

it("コマンドに対するメイン ウィンドウのファイル ナビゲーションは提供されません", () => {
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

it("デスクトップ上のファイル結果に対する外部オープンアクションを提供します", async () => {
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

it("コマンドの外部オープンアクションを非表示にします", () => {
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

it("エディター、エクスプローラー、およびノー​​トナビゲーションなしのプラグイン結果の設定を提供します", () => {
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

it("設定なしでスニペット結果を表示するためのエディターとエクスプローラーを提供します", () => {
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

it("すべての結果メニューのアクション フィルターをオンにします", () => {
	const f = fixture(false);
	populatePaletteResultMenu(f.options);
	expect(f.options.menu.enableFilter).toHaveBeenCalledOnce();
});

it("選択範囲全体にブックマーク アクションを追加し、変更後に更新します。", async () => {
	const { addBookmarkMenuItems } = await import("src/features/palette/actions/bookmarkMenu");
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

// 以下は、ヘルパーを名前だけの項目に差し替えるので、ファイルの末尾に置く。
const EDITING_GROUP = [
	"移動…",
	"名前を変更…",
	"プロパティを編集…",
	"タグを追加…",
	"MOC の Relateds に挿入",
	"ブックマークに追加…",
];

it("ファイルの結果のメニューは、開く・外へ渡す・編集・危険な操作の順にグループを分け、外部アプリを畳む", async () => {
	await stubEditingHelpers();
	const f = fixture(false);
	populatePaletteResultMenu(f.options);

	expect(f.groups()).toEqual([
		["開く", "新しいタブで開く(バックグラウンド)", "横で開く", "下で開く"],
		["外部アプリ", "パスをコピー"],
		EDITING_GROUP,
		["マージ…", "ノートを削除"],
	]);
	expect(f.submenus.get("外部アプリ")).toEqual([
		"外部エディターで開く",
		"システムのエクスプローラーで表示",
		"ターミナルで開く",
	]);
});

it("複数選択のメニューも、コピー・編集・危険な操作の順にグループを分ける", async () => {
	await stubEditingHelpers();
	const f = fixture(false);
	populatePaletteResultMenu({
		...f.options,
		selectedItems: [f.options.result, { ...f.options.result, id: "second", primary: "Second" }],
	});

	expect(f.groups()).toEqual([["パスをコピー"], EDITING_GROUP, ["マージ…", "ノートを削除"]]);
});

it("プラグインの結果は、外部アプリと設定のあとに区切ってパスのコピーを出す", async () => {
	await stubEditingHelpers();
	const f = fixture(false);
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
	populatePaletteResultMenu({ ...f.options, result, selectedItems: [result] });

	expect(f.groups()).toEqual([["外部アプリ", "プラグインの設定を開く"], ["パスをコピー"]]);
});

it("絶対パスがなく外部エディターしか出せないときは、サブメニューに畳まずにそのまま出す", async () => {
	await stubEditingHelpers();
	const { isDesktopApp } = await import("src/platform/externalOpen");
	vi.mocked(isDesktopApp).mockReturnValueOnce(false);
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

	expect(f.groups()).toEqual([["外部エディターで開く"], ["パスをコピー"]]);
	expect(f.submenus.size).toBe(0);
});
