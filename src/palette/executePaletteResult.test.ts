import { TFile, type App, type WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";

vi.mock("obsidian", () => ({
	TFile: class {
		path = "Note.md";
	},
	Notice: class {},
	normalizePath: (path: string) => path,
}));

function fixture() {
	const file = new TFile();
	const leaf = {
		openFile: vi.fn().mockResolvedValue(undefined),
		getViewState: () => ({ pinned: false }),
		view: { editor: { setCursor: vi.fn() } },
	};
	const workspace = {
		getLeaf: vi.fn().mockReturnValue(leaf),
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
		settings: { openExternalMarkdownInObsidian: true },
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

describe("note opening focus", () => {
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
	it("focuses the fallback leaf when the requested target is pinned", async () => {
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
	it("reveals ArrowRight previews without focusing the editor", async () => {
		const f = fixture();
		await executePaletteResult(f.plugin, result("file", f.file), "primary", {
			...f.options,
			autoFocus: false,
		});
		expect(f.workspace.revealLeaf).toHaveBeenCalledWith(f.leaf);
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});
	it("keeps middle-click opens in the background", async () => {
		const f = fixture();
		await openPaletteResultInBackground(f.plugin, result("file", f.file));
		expect(f.leaf.openFile).toHaveBeenCalledWith(f.file, { active: false });
		expect(f.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});
	it("does not focus a destination after an open fails", async () => {
		const f = fixture();
		f.leaf.openFile.mockRejectedValue(new Error("open failed"));
		await expect(
			executePaletteResult(f.plugin, result("file", f.file), "primary", f.options),
		).rejects.toThrow("open failed");
		expect(f.workspace.revealLeaf).not.toHaveBeenCalled();
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	});
});
