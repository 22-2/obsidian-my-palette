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

describe("操作に応じたリーフ取得", () => {
	it("固定されていないプライマリターゲットを再利用します", () => {
		const getLeaf = vi.fn();
		const app = fakeApp(getLeaf);
		const target = fakeLeaf(false);

		expect(getLeafForAction(app, "primary", target)).toBe(target);
		expect(getLeaf).not.toHaveBeenCalled();
	});

	it("固定されたプライマリ ターゲットのナビゲート可能なリーフにフォールバックします", () => {
		const fallback = fakeLeaf(false);
		const getLeaf = vi.fn().mockReturnValue(fallback);
		const app = fakeApp(getLeaf);

		expect(getLeafForAction(app, "primary", fakeLeaf(true))).toBe(fallback);
		expect(getLeaf).toHaveBeenCalledWith(false);
	});

	it("要求された新しいリーフで代替アクションと分割アクションを維持します", () => {
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

describe("明らかに開いた葉", () => {
	it("遅延された宛先にフォーカスを与える前にその宛先を待ちます", async () => {
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
	it("キーボードのフォーカスを移動せずにプレビューを表示します", async () => {
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

describe("ファイルインリーフを開く", () => {
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

	it("すでにファイルを表示しているリーフを検索します", () => {
		const other = fileLeaf("other.md");
		const match = fileLeaf("note.md");
		const { app, file } = fixture([other, match]);
		expect(findLeafShowingFile(app, file)).toBe(match);
	});

	it("ファイルを再度開かずに既存のタブを表示します", async () => {
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

	it("既存のタブのフォーカスがオフのときに新しいリーフを開きます", async () => {
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

	it("バックグラウンドで開くために既存のタブをそのままにしておく", async () => {
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

	it("新しいリーフで開いている背景をアクティブ化せずにロードします", async () => {
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
