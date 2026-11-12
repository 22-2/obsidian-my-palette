import { Notice, TFile, type App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SingleRenameModal } from "src/features/rename/SingleRenameModal";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: vi.fn(),
	TFile: class {
		constructor(public path: string) {}
	},
}));

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"HTMLElement",
		"Event",
		"MouseEvent",
		"KeyboardEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	vi.useFakeTimers();
	dom.setTimeout = globalThis.setTimeout;
	installObsidianDom();
	vi.mocked(Notice).mockClear();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

async function open(existing: string[] = []) {
	const Ctor = TFile as unknown as new (path: string) => TFile;
	const file = Object.assign(new Ctor("notes/Sample view.base"), {
		basename: "Sample view",
	});
	const renameFile = vi.fn(async () => {});
	const app = {
		vault: {
			getAbstractFileByPath: (path: string) => (path === file.path ? file : null),
			getAllLoadedFiles: () => [file, ...existing.map((path) => ({ path }))],
		},
		fileManager: { renameFile },
	} as unknown as App;
	const onDone = vi.fn();
	new SingleRenameModal(app, file, onDone).open();
	await vi.advanceTimersByTimeAsync(0);
	const input = document.querySelector<HTMLInputElement>("input")!;
	const type = async (value: string) => {
		input.value = value;
		input.dispatchEvent(new Event("input", { bubbles: true }));
		await vi.advanceTimersByTimeAsync(0);
	};
	const enter = async (init: KeyboardEventInit = {}) => {
		input.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "Enter",
				bubbles: true,
				cancelable: true,
				...init,
			}),
		);
		await vi.advanceTimersByTimeAsync(0);
	};
	const rows = () =>
		[...document.querySelectorAll(".suggestion-item")].map((row) => row.textContent);
	return { input, type, enter, rows, renameFile, onDone };
}

describe("1つのファイルの名前を直接打って変える", () => {
	it("今の名前(拡張子なし)が入力済みで、変更なしと表示する", async () => {
		const { input, rows } = await open();
		expect(input.value).toBe("Sample view");
		expect(input.placeholder).toBe("新しい名前(拡張子は変わりません)");
		expect(rows()).toEqual([expect.stringContaining("Sample view.base")]);
		expect(rows()[0]).toContain("変更なし");
	});

	it("打った名前をプレビューし、Enter で拡張子を保ったまま変更して閉じる", async () => {
		const { type, enter, rows, renameFile, onDone } = await open();
		await type("Renamed");
		expect(rows()[0]).toContain("Sample view.base → Renamed.base");

		await enter();
		expect(renameFile).toHaveBeenCalledWith(expect.anything(), "notes/Renamed.base");
		expect(onDone).toHaveBeenCalledOnce();
		expect(document.querySelector(".suggestion-item")).toBeNull();
	});

	it("同名のファイルがあれば、印を付けて変更しない", async () => {
		const { type, enter, rows, renameFile, onDone } = await open(["notes/Taken.base"]);
		await type("Taken");
		expect(rows()[0]).toContain("既に存在します");

		await enter();
		expect(renameFile).not.toHaveBeenCalled();
		expect(onDone).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith("名前を変更する前に、印の付いた名前を直してください。");
	});

	it("名前が変わらないときは、変更せずに案内する", async () => {
		const { enter, renameFile } = await open();
		await enter();
		expect(renameFile).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith("名前が変わるファイルはありません。");
	});
});
