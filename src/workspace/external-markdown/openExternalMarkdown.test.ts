import type { App, WorkspaceLeaf } from "obsidian";
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
	return {
		leaf,
		workspace,
		plugin: { app, settings: { focusExistingTab: true } } as unknown as MyPalettePlugin,
	};
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

it("新しく作成された背景の外部ノートを表示したりフォーカスしたりしません", async () => {
	const f = fixture(false);
	await openExternalMarkdown(f.plugin, "C:/outside.md", "alternate", true, false);
	expect(f.leaf.setViewState).toHaveBeenCalledWith(expect.objectContaining({ active: false }));
	expect(f.workspace.revealLeaf).not.toHaveBeenCalled();
	expect(f.workspace.setActiveLeaf).not.toHaveBeenCalled();
});

it("外部ファイルがすでにポップアウトで開かれている場合、明示的なメイン ウィンドウ ターゲットを尊重します。", async () => {
	const f = fixture(true);
	const popout = {};
	const mainWindow = {};
	Object.assign(f.leaf, { getContainer: () => popout });
	const target = {
		getContainer: () => mainWindow,
		getViewState: () => ({ pinned: false }),
		setViewState: vi.fn().mockResolvedValue(undefined),
	} as unknown as WorkspaceLeaf;
	await openExternalMarkdown(f.plugin, "C:/outside.md", "primary", true, true, target);
	expect(target.setViewState).toHaveBeenCalledWith(
		expect.objectContaining({
			active: true,
			state: expect.objectContaining({ file: "file:C:/outside.md" }),
		}),
	);
	expect(f.leaf.setViewState).not.toHaveBeenCalled();
	expect(f.workspace.setActiveLeaf).toHaveBeenCalledExactlyOnceWith(target, { focus: true });
});

it("メイン ウィンドウに同じパスが存在する場合でも、新しい外部 Markdown タブを開きます", async () => {
	const f = fixture(true);
	const mainWindow = {};
	Object.assign(f.leaf, { getContainer: () => mainWindow });
	const target = {
		getContainer: () => mainWindow,
		getViewState: () => ({ pinned: false }),
		setViewState: vi.fn().mockResolvedValue(undefined),
	} as unknown as WorkspaceLeaf;
	await openExternalMarkdown(f.plugin, "C:/outside.md", "primary", true, true, target, false);
	expect(target.setViewState).toHaveBeenCalled();
	expect(f.leaf.setViewState).not.toHaveBeenCalled();
	expect(f.workspace.setActiveLeaf).toHaveBeenCalledExactlyOnceWith(target, { focus: true });
});
