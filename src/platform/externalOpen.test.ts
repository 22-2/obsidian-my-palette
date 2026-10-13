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

describe("getResultAbsolutePath", () => {
	it("resolves vault files to absolute paths", () => {
		const app = appWithPaths("C:/vault/Note.md");
		const result: PaletteResult = { ...base, mode: "file", vaultPath: "Note.md" };
		expect(getResultAbsolutePath(app, result)).toBe("C:/vault/Note.md");
	});

	it("returns the absolute path for Everything results", () => {
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

	it("returns the folder path for plugin results", () => {
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

	it("resolves link and bookmark files through the vault adapter", () => {
		const app = appWithPaths("C:/vault/Link.md");
		const file = { path: "Link.md" } as unknown as import("obsidian").TFile;
		expect(getResultAbsolutePath(app, { ...base, mode: "link", file, line: 1 })).toBe(
			"C:/vault/Link.md",
		);
		expect(getResultAbsolutePath(app, { ...base, mode: "bookmark", kind: "file", file })).toBe(
			"C:/vault/Link.md",
		);
	});

	it("has no path for commands and search entries", () => {
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

describe("isFolderResult", () => {
	it("marks only Everything folders as folders", () => {
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

	it("treats plugin folders as folders", () => {
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
});

describe("external actions", () => {
	it("opens the path in the external editor", async () => {
		const { openPathInCode } = await import("src/platform/vscode");
		await openInExternalEditor("C:/vault/Note.md");
		expect(openPathInCode).toHaveBeenCalledExactlyOnceWith("C:/vault/Note.md");
	});

	it("reveals files and opens folders in the system explorer", async () => {
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
