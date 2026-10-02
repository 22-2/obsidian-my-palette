import type { App } from "obsidian";
import { expect, it, vi } from "vitest";
import type MyPalettePlugin from "src/main";
import { openExternalMarkdown } from "src/workspace/external-markdown/openExternalMarkdown";

function fixture(reuse: boolean) {
	const leaf = {
		getViewState: () => ({ pinned: false }),
		setViewState: vi.fn().mockResolvedValue(undefined),
		view: { getViewType: () => "markdown", getState: () => ({ file: "file:C:/outside.md" }) },
	};
	const workspace = {
		getLeavesOfType: () => (reuse ? [leaf] : []),
		getLeaf: vi.fn().mockReturnValue(leaf),
		revealLeaf: vi.fn().mockResolvedValue(undefined),
		setActiveLeaf: vi.fn(),
	};
	const app = {
		workspace,
		vault: { adapter: { path: { resolve: (path: string) => path } } },
	} as unknown as App;
	return { leaf, workspace, plugin: { app } as MyPalettePlugin };
}

it.each([false, true])("reveals and focuses external Markdown (reuse=%s)", async (reuse) => {
	const f = fixture(reuse);
	await openExternalMarkdown(f.plugin, "C:/outside.md", "primary");
	expect(f.workspace.revealLeaf).toHaveBeenCalledExactlyOnceWith(f.leaf);
	expect(f.workspace.setActiveLeaf).toHaveBeenCalledExactlyOnceWith(f.leaf, { focus: true });
});

it.each([false, true])(
	"preserves preview focus for external Markdown (reuse=%s)",
	async (reuse) => {
		const f = fixture(reuse);
		await openExternalMarkdown(f.plugin, "C:/outside.md", "primary", false);
		expect(f.workspace.revealLeaf).toHaveBeenCalledWith(f.leaf);
		expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
	},
);

it("does not reveal or focus newly created background external notes", async () => {
	const f = fixture(false);
	await openExternalMarkdown(f.plugin, "C:/outside.md", "alternate", true, false);
	expect(f.leaf.setViewState).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
	expect(f.workspace.revealLeaf).not.toHaveBeenCalled();
	expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
});
