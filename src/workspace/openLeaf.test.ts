import type { App, WorkspaceLeaf } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { getLeafForAction } from "src/workspace/openLeaf";

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
