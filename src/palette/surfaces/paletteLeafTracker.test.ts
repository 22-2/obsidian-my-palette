import type { App, View, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { PaletteLeafTracker } from "src/palette/surfaces/paletteLeafTracker";

vi.mock("obsidian", () => ({ TFile: class {} }));

function fixture() {
	const rootSplit = {};
	const leaf = (view: object = {}, root: object = rootSplit) =>
		({ view, getRoot: () => root }) as unknown as WorkspaceLeaf;
	const own = leaf();
	const created = leaf();
	const workspace = {
		rootSplit,
		activeLeaf: null as WorkspaceLeaf | null,
		getLeaf: vi.fn().mockReturnValue(created),
		getMostRecentLeaf: vi.fn().mockReturnValue(null),
	};
	const isPalette = (view: View) => "palette" in view;
	const tracker = new PaletteLeafTracker({ workspace } as unknown as App, own, isPalette);
	return { tracker, workspace, leaf, own, created, rootSplit };
}

describe("palette leaf tracker", () => {
	it("never treats its own leaf, other palettes, or sidebar leaves as targets", () => {
		const f = fixture();
		expect(f.tracker.isCenterLeaf(f.own)).toBe(false);
		expect(f.tracker.isCenterLeaf(f.leaf({ palette: true }))).toBe(false);
		expect(f.tracker.isCenterLeaf(f.leaf({}, {}))).toBe(false);
		expect(f.tracker.isCenterLeaf(f.leaf())).toBe(true);
	});

	it("prefers the active center leaf, then the tracked one, then a new tab", () => {
		const f = fixture();
		const tracked = f.leaf();
		const active = f.leaf();
		expect(f.tracker.track(tracked)).toBe(true);
		expect(f.tracker.track(f.leaf({}, {}))).toBe(false);

		f.workspace.activeLeaf = active;
		expect(f.tracker.resolveTargetLeaf()).toBe(active);

		f.workspace.activeLeaf = f.leaf({}, {});
		expect(f.tracker.resolveTargetLeaf()).toBe(active);
	});

	it("allocates one tab when no center leaf exists", () => {
		const f = fixture();
		expect(f.tracker.resolveTargetLeaf()).toBe(f.created);
		expect(f.workspace.getLeaf).toHaveBeenCalledWith("tab");
	});
});
