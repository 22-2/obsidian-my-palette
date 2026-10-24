import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	getResultAbsolutePath,
	isFolderResult,
	openInExternalEditor,
	showInSystemExplorer,
} from "src/platform/externalOpen";
import type { PaletteResult } from "src/palette/results";

vi.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
}));

vi.mock("src/platform/vscode", () => ({
	openPathInCode: vi.fn().mockResolvedValue(null),
}));

const base = { id: "id", primary: "p", secondary: "s", icon: "i" };

function appWithPaths(fullPath: string | null): App {
	return {
		vault: {
			adapter: {
				getFullPath: () => fullPath,
			},
		},
	} as unknown as App;
}

describe("getResult絶対パス", () => {
	it("Vault ファイルを絶対パスに解決します", () => {
		const app = appWithPaths("C:/vault/Note.md");
		const result: PaletteResult = { ...base, mode: "file", vaultPath: "Note.md" };
		expect(getResultAbsolutePath(app, result)).toBe("C:/vault/Note.md");
	});

	it("すべての結果の絶対パスを返します", () => {
		const app = appWithPaths(null);
		const result: PaletteResult = {
			...base,
			mode: "everything",
			absolutePath: "C:/vault/image.png",
			scope: "vault",
			kind: "file",
			attributes: "",
		};
		expect(getResultAbsolutePath(app, result)).toBe("C:/vault/image.png");
	});

	it("プラグイン結果のフォルダー パスを返します。", () => {
		const app = appWithPaths(null);
		expect(
			getResultAbsolutePath(app, {
				...base,
				mode: "plugin",
				pluginId: "alpha",
				absolutePath: "C:/vault/cfg/plugins/alpha",
				vaultPath: "cfg/plugins/alpha",
				enabled: true,
				hasSettings: false,
			}),
		).toBe("C:/vault/cfg/plugins/alpha");
	});

	it("スニペットファイルとフォルダーのパスを返します。", () => {
		const app = appWithPaths(null);
		expect(
			getResultAbsolutePath(app, {
				...base,
				mode: "snippet",
				snippetName: "alpha.css",
				absolutePath: "C:/vault/cfg/snippets/alpha.css",
				vaultPath: "cfg/snippets/alpha.css",
				isFolder: false,
				enabled: true,
			}),
		).toBe("C:/vault/cfg/snippets/alpha.css");
	});

	it("Vault アダプターを介してリンク ファイルとブックマーク ファイルを解決します。", () => {
		const app = appWithPaths("C:/vault/Link.md");
		const file = { path: "Link.md" } as unknown as import("obsidian").TFile;
		expect(getResultAbsolutePath(app, { ...base, mode: "link", file, line: 1 })).toBe(
			"C:/vault/Link.md",
		);
		expect(getResultAbsolutePath(app, { ...base, mode: "bookmark", kind: "file", file })).toBe(
			"C:/vault/Link.md",
		);
	});

	it("コマンドと検索エントリのパスがありません", () => {
		const app = appWithPaths("C:/vault/Note.md");
		expect(
			getResultAbsolutePath(app, { ...base, mode: "command", commandId: "c" }),
		).toBeUndefined();
		expect(
			getResultAbsolutePath(app, {
				...base,
				mode: "bookmark",
				kind: "search",
				query: "q",
			}),
		).toBeUndefined();
	});
});

describe("フォルダー結果の判定", () => {
	it("Everythingフォルダーのみをフォルダーとしてマークします", () => {
		expect(
			isFolderResult({
				...base,
				mode: "everything",
				absolutePath: "C:/vault/folder",
				scope: "vault",
				kind: "folder",
				attributes: "",
			}),
		).toBe(true);
		expect(
			isFolderResult({
				...base,
				mode: "everything",
				absolutePath: "C:/vault/a.md",
				scope: "vault",
				kind: "file",
				attributes: "",
			}),
		).toBe(false);
		expect(isFolderResult({ ...base, mode: "file", vaultPath: "a.md" })).toBe(false);
	});

	it("プラグインフォルダーをフォルダーとして扱います", () => {
		expect(
			isFolderResult({
				...base,
				mode: "plugin",
				pluginId: "alpha",
				absolutePath: "C:/vault/cfg/plugins/alpha",
				vaultPath: "cfg/plugins/alpha",
				enabled: true,
				hasSettings: false,
			}),
		).toBe(true);
	});

	it("フォルダー検出のためのスニペット行の後に続きます", () => {
		const folder = {
			...base,
			mode: "snippet",
			snippetName: "",
			absolutePath: "C:/vault/cfg/snippets",
			vaultPath: "cfg/snippets",
			isFolder: true,
			enabled: true,
		} as const;
		const file = { ...folder, snippetName: "alpha.css", isFolder: false };
		expect(isFolderResult(folder)).toBe(true);
		expect(isFolderResult(file)).toBe(false);
	});
});

describe("外部アクション", () => {
	it("外部エディタでパスを開きます", async () => {
		const { openPathInCode } = await import("src/platform/vscode");
		await openInExternalEditor("C:/vault/Note.md");
		expect(openPathInCode).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md");
	});

	it("システムエクスプローラーでファイルを表示し、フォルダーを開きます", async () => {
		const showItemInFolder = vi.fn();
		const openPath = vi.fn().mockResolvedValue("");
		vi.stubGlobal("electron", { shell: { showItemInFolder, openPath } });
		showInSystemExplorer("C:/vault/Note.md", false);
		expect(showItemInFolder).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md");
		showInSystemExplorer("C:/vault/folder", true);
		expect(openPath).toHaveBeenCalledExactlyOnceWith("C:/vault/folder");
		vi.unstubAllGlobals();
	});
});
