import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	TFile: class {
		path = "Note.md";
	},
	Notice: class {},
	normalizePath: (path: string) => path,
	Platform: { isDesktopApp: true },
}));

vi.mock("src/platform/externalOpen", () => ({
	openInExternalEditor: vi.fn().mockResolvedValue(null),
}));

vi.mock("src/tags/insertTags", () => ({ insertTags: vi.fn() }));
vi.mock("src/properties/propertyValueSelector", () => ({ editListProperty: vi.fn() }));
vi.mock("src/properties/propertyInputSelector", () => ({ editPropertyValue: vi.fn() }));

function fixture() {
	const file = new TFile();
	const leaf = {
		openFile: vi.fn().mockResolvedValue(undefined),
		getViewState: () => ({ pinned: false }),
		view: { editor: { setCursor: vi.fn() } },
	};
	const workspace = {
		getLeaf: vi.fn().mockReturnValue(leaf),
		iterateAllLeaves: vi.fn(),
		revealLeaf: vi.fn().mockResolvedValue(undefined),
		setActiveLeaf: vi.fn(),
	};
	const app = {
		workspace,
		vault: {
			getConfig: () => [],
			getAbstractFileByPath: () => file,
			adapter: { fs: { promises: { stat: vi.fn().mockResolvedValue({}) } } },
		},
	} as unknown as App;
	const plugin = {
		app,
		settings: { openExternalMarkdownInObsidian: true, focusExistingTab: true },
		recordResultUsage: vi.fn(),
	} as unknown as MyPalettePlugin;
	const options = { active: true, closeWhenDone: false, close: vi.fn(), showError: vi.fn() };
	return { file, leaf, workspace, plugin, options };
}

function result(
	mode: "file" | "everything" | "bookmark" | "smart" | "link" | "backlink",
	file: TFile,
): PaletteResult {
	const common = { id: "note", primary: "Note", secondary: "", icon: "file" };
	switch (mode) {
		case "file":
			return { ...common, mode, vaultPath: file.path };
		case "everything":
			return {
				...common,
				mode,
				absolutePath: "C:/vault/Note.md",
				vaultPath: file.path,
				scope: "vault",
				kind: "file",
				attributes: "",
			};
		case "bookmark":
			return { ...common, mode, kind: "file", file };
		case "smart":
			return { ...common, mode, file, score: 1 };
		default:
			return { ...common, mode, file, line: 17 };
	}
}

describe("メモの開始フォーカス", () => {
	it.each(["file", "everything", "bookmark", "smart", "link", "backlink"] as const)(
		"reveals and focuses the opened %s result",
		async (mode) => {
			const f = fixture();
			await executePaletteResult(f.plugin, result(mode, f.file), "primary", f.options);
			expect(f.leaf.openFile).toHaveBeenCalledWith(f.file, { active: true });
			expect(f.workspace.revealLeaf).toHaveBeenCalledExactlyOnceWith(f.leaf);
			expect(f.workspace.setActiveLeaf).toHaveBeenCalledExactlyOnceWith(f.leaf, {
				focus: true,
			});
			if (mode === "link" || mode === "backlink")
				expect(f.leaf.view.editor.setCursor).toHaveBeenCalledWith({ line: 17, ch: 0 });
		},
	);
	it("要求されたターゲットが固定されている場合にフォールバック リーフに焦点を当てます", async () => {
		const f = fixture();
		const pinned = { getViewState: () => ({ pinned: true }), openFile: vi.fn() };
		await executePaletteResult(f.plugin, result("file", f.file), "primary", {
			...f.options,
			targetLeaf: pinned as unknown as WorkspaceLeaf,
		});
		expect(pinned.openFile).not.toHaveBeenCalled();
		expect(f.workspace.setActiveLeaf).toHaveBeenCalledWith(f.leaf, { focus: true });
	});
	it.each(["alternate", "vertical", "horizontal"] as const)(
		"focuses the new destination for %s opens",
		async (action) => {
			const f = fixture();
			await executePaletteResult(f.plugin, result("file", f.file), action, f.options);
			expect(f.workspace.revealLeaf).toHaveBeenCalledWith(f.leaf);
			expect(f.workspace.setActiveLeaf).toHaveBeenCalledWith(f.leaf, { focus: true });
		},
	);
	it("エディターにフォーカスを当てずに ArrowRight プレビューを表示します", async () => {
		const f = fixture();
		await executePaletteResult(f.plugin, result("file", f.file), "primary", {
			...f.options,
			autoFocus: false,
		});
		expect(f.workspace.revealLeaf).toHaveBeenCalledWith(f.leaf);
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});
	it("中クリックでバックグラウンドで開いたままにする", async () => {
		const f = fixture();
		await openPaletteResultInBackground(f.plugin, result("file", f.file));
		expect(f.leaf.openFile).toHaveBeenCalledWith(f.file, { active: false });
		expect(f.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});
	it("明示的な新しいタブ ポリシーを外部の Markdown 開口部に渡します", async () => {
		const f = fixture();
		f.plugin.openExternalMarkdown = vi.fn().mockResolvedValue(undefined);
		const external: PaletteResult = {
			id: "external",
			mode: "everything",
			primary: "Outside",
			secondary: "",
			icon: "file",
			absolutePath: "C:/outside.md",
			scope: "directory",
			kind: "file",
			attributes: "",
		};
		await executePaletteResult(f.plugin, external, "primary", {
			...f.options,
			targetLeaf: f.leaf as unknown as WorkspaceLeaf,
			reuseExternalMarkdownLeaf: false,
		});
		expect(f.plugin.openExternalMarkdown).toHaveBeenCalledExactlyOnceWith(
			"C:/outside.md",
			"primary",
			true,
			true,
			f.leaf,
			false,
		);
	});
	it("オープンに失敗した後、宛先に焦点を当てません", async () => {
		const f = fixture();
		f.leaf.openFile.mockRejectedValue(new Error("open failed"));
		await expect(
			executePaletteResult(f.plugin, result("file", f.file), "primary", f.options),
		).rejects.toThrow("open failed");
		expect(f.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});

	it("外部エディタでプラグインフォルダーを開きます", async () => {
		const f = fixture();
		const { openInExternalEditor } = await import("src/platform/externalOpen");
		const pluginResult: PaletteResult = {
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
		await executePaletteResult(f.plugin, pluginResult, "primary", f.options);
		expect(openInExternalEditor).toHaveBeenCalledExactlyOnceWith("C:/vault/cfg/plugins/alpha");
		expect(f.options.close).not.toHaveBeenCalled();
	});

	it("外部エディタでスニペット ファイルを開きます", async () => {
		const f = fixture();
		const { openInExternalEditor } = await import("src/platform/externalOpen");
		const snippetResult: PaletteResult = {
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
		await executePaletteResult(f.plugin, snippetResult, "primary", f.options);
		expect(openInExternalEditor).toHaveBeenCalledWith("C:/vault/cfg/snippets/alpha.css");
	});
});
