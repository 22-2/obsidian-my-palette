import type { App, TFile, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	findLeafShowingFile,
	getLeafForAction,
	openFileInLeaf,
	revealOpenedLeaf,
} from "src/workspace/openLeaf";

function fakeLeaf(pinned: boolean): WorkspaceLeaf {
	return { getViewState: () => ({ pinned }) } as unknown as WorkspaceLeaf;
}

function fakeApp(getLeaf: ReturnType<typeof vi.fn>): App {
	return { workspace: { getLeaf } } as unknown as App;
}

describe("getLeafForAction", () => {
	it("reuses an unpinned primary target", () => {
		const getLeaf = vi.fn();
		const app = fakeApp(getLeaf);
		const target = fakeLeaf(false);

		expect(getLeafForAction(app, "primary", target)).toBe(target);
		expect(getLeaf).not.toHaveBeenCalled();
	});

	it("falls back to a navigable leaf for a pinned primary target", () => {
		const fallback = fakeLeaf(false);
		const getLeaf = vi.fn().mockReturnValue(fallback);
		const app = fakeApp(getLeaf);

		expect(getLeafForAction(app, "primary", fakeLeaf(true))).toBe(fallback);
		expect(getLeaf).toHaveBeenCalledWith(false);
	});

	it("keeps alternate and split actions on their requested new leaf", () => {
		const tab = fakeLeaf(false);
		const horizontal = fakeLeaf(false);
		const vertical = fakeLeaf(false);
		const getLeaf = vi
			.fn()
			.mockReturnValueOnce(tab)
			.mockReturnValueOnce(horizontal)
			.mockReturnValueOnce(vertical);
		const app = fakeApp(getLeaf);
		const pinnedTarget = fakeLeaf(true);

		expect(getLeafForAction(app, "alternate", pinnedTarget)).toBe(tab);
		expect(getLeafForAction(app, "horizontal", pinnedTarget)).toBe(horizontal);
		expect(getLeafForAction(app, "vertical", pinnedTarget)).toBe(vertical);
		expect(getLeaf).toHaveBeenNthCalledWith(1, "tab");
		expect(getLeaf).toHaveBeenNthCalledWith(2, "split", "horizontal");
		expect(getLeaf).toHaveBeenNthCalledWith(3, "split", "vertical");
	});
});

describe("revealOpenedLeaf", () => {
	it("waits for a deferred destination before giving it focus", async () => {
		const leaf = fakeLeaf(false);
		let loaded!: () => void;
		const revealLeaf = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					loaded = resolve;
				}),
		);
		const setActiveLeaf = vi.fn();
		const app = { workspace: { revealLeaf, setActiveLeaf } } as unknown as App;
		const revealing = revealOpenedLeaf(app, leaf);
		expect(revealLeaf).toHaveBeenCalledWith(leaf);
		expect(setActiveLeaf).not.toHaveBeenCalled();
		loaded();
		await revealing;
		expect(setActiveLeaf).toHaveBeenCalledExactlyOnceWith(leaf, { focus: true });
	});
	it("reveals a preview without moving keyboard focus", async () => {
		const leaf = fakeLeaf(false);
		const revealLeaf = vi.fn().mockResolvedValue(undefined);
		const setActiveLeaf = vi.fn();
		await revealOpenedLeaf(
			{ workspace: { revealLeaf, setActiveLeaf } } as unknown as App,
			leaf,
			false,
		);
		expect(revealLeaf).toHaveBeenCalledWith(leaf);
		expect(setActiveLeaf).not.toHaveBeenCalled();
	});
});

describe("openFileInLeaf", () => {
	function fileLeaf(path: string) {
		return {
			getViewState: () => ({ pinned: false }),
			openFile: vi.fn().mockResolvedValue(undefined),
			view: { file: { path } },
		};
	}
	function fixture(existing: ReturnType<typeof fileLeaf>[] = [], created = fileLeaf("new.md")) {
		const workspace = {
			getLeaf: vi.fn().mockReturnValue(created),
			iterateAllLeaves: vi.fn((callback: (leaf: unknown) => void) =>
				existing.forEach(callback),
			),
			revealLeaf: vi.fn().mockResolvedValue(undefined),
			setActiveLeaf: vi.fn(),
		};
		const app = { workspace } as unknown as App;
		const file = { path: "note.md" } as unknown as TFile;
		return { app, workspace, file, created };
	}

	it("finds the leaf that already shows the file", () => {
		const other = fileLeaf("other.md");
		const match = fileLeaf("note.md");
		const { app, file } = fixture([other, match]);
		expect(findLeafShowingFile(app, file)).toBe(match);
	});

	it("reveals the existing tab instead of opening the file again", async () => {
		const existing = fileLeaf("note.md");
		const { app, workspace, file, created } = fixture([existing]);
		const leaf = await openFileInLeaf(app, file, {
			action: "primary",
			active: true,
			autoFocus: true,
			focusExisting: true,
		});
		expect(leaf).toBe(existing);
		expect(existing.openFile).not.toHaveBeenCalled();
		expect(created.openFile).not.toHaveBeenCalled();
		expect(workspace.revealLeaf).toHaveBeenCalledExactlyOnceWith(existing);
		expect(workspace.setActiveLeaf).toHaveBeenCalledExactlyOnceWith(existing, { focus: true });
	});

	it("opens a new leaf when focusing existing tabs is off", async () => {
		const existing = fileLeaf("note.md");
		const { app, workspace, file, created } = fixture([existing]);
		const leaf = await openFileInLeaf(app, file, {
			action: "primary",
			active: true,
			autoFocus: true,
			focusExisting: false,
		});
		expect(leaf).toBe(created);
		expect(created.openFile).toHaveBeenCalledWith(file, { active: true });
		expect(workspace.revealLeaf).toHaveBeenCalledWith(created);
	});

	it("leaves an existing tab alone for background opens", async () => {
		const existing = fileLeaf("note.md");
		const { app, workspace, file, created } = fixture([existing]);
		await openFileInLeaf(app, file, {
			action: "alternate",
			active: false,
			autoFocus: false,
			focusExisting: true,
		});
		expect(workspace.revealLeaf).not.toHaveBeenCalled();
		expect(workspace.setActiveLeaf).not.toHaveBeenCalled();
		expect(created.openFile).not.toHaveBeenCalled();
	});

	it("loads a background open in a new leaf without activating it", async () => {
		const { app, workspace, file, created } = fixture();
		await openFileInLeaf(app, file, {
			action: "alternate",
			active: false,
			autoFocus: false,
			focusExisting: true,
		});
		expect(created.openFile).toHaveBeenCalledWith(file, { active: false });
		expect(workspace.revealLeaf).not.toHaveBeenCalled();
	});
});
