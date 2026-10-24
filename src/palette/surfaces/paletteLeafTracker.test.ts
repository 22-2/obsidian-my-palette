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
		getLeaf: vi.fn().mockReturnValue(created),
		getMostRecentLeaf: vi.fn().mockReturnValue(null as WorkspaceLeaf | null),
	};
	const isPalette = (view: View) => "palette" in view;
	const tracker = new PaletteLeafTracker({ workspace } as unknown as App, own, isPalette);
	return { tracker, workspace, leaf, own, created, rootSplit };
}

describe("パレットリーフトラッカー", () => {
	it("自身のリーフ、他のパレット、サイドバーのリーフをターゲットとして扱うことはありません。", () => {
		const f = fixture();
		expect(f.tracker.isCenterLeaf(f.own)).toBe(false);
		expect(f.tracker.isCenterLeaf(f.leaf({ palette: true }))).toBe(false);
		expect(f.tracker.isCenterLeaf(f.leaf({}, {}))).toBe(false);
		expect(f.tracker.isCenterLeaf(f.leaf())).toBe(true);
	});

	it("アクティブな中央のリーフ、次に追跡されたリーフ、次に新しいタブを優先します", () => {
		const f = fixture();
		const tracked = f.leaf();
		const active = f.leaf();
		expect(f.tracker.track(tracked)).toBe(true);
		expect(f.tracker.track(f.leaf({}, {}))).toBe(false);

		f.workspace.getMostRecentLeaf.mockReturnValue(active);
		expect(f.tracker.resolveTargetLeaf()).toBe(active);

		f.workspace.getMostRecentLeaf.mockReturnValue(f.leaf({}, {}));
		expect(f.tracker.resolveTargetLeaf()).toBe(active);
	});

	it("中央のリーフが存在しない場合に 1 つのタブを割り当てます", () => {
		const f = fixture();
		expect(f.tracker.resolveTargetLeaf()).toBe(f.created);
		expect(f.workspace.getLeaf).toHaveBeenCalledWith("tab");
	});
});
