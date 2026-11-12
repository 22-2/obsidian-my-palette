import { Notice, type App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openConfirmPalette } from "src/ui/confirmPalette";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: vi.fn(),
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

async function open() {
	const onConfirm = vi.fn();
	openConfirmPalette({} as App, {
		title: "ノートをゴミ箱に移動しますか",
		paragraphs: ["「a.md」をゴミ箱へ移動します。", "元に戻せません。"],
		action: "ゴミ箱に移動する",
		onConfirm,
	});
	await Promise.resolve();
	const input = document.querySelector<HTMLInputElement>("input")!;
	const rows = () => [...document.querySelectorAll<HTMLElement>(".suggestion-item")];
	return { onConfirm, input, rows };
}

function key(el: HTMLElement, name: string, options: KeyboardEventInit = {}) {
	el.dispatchEvent(
		new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...options }),
	);
}

describe("確認パレット", () => {
	it("影響の説明、実行、キャンセルの順に行を並べ、問いを入力欄の案内にする", async () => {
		const { input, rows } = await open();
		expect(input.placeholder).toBe("ノートをゴミ箱に移動しますか");
		expect(input.readOnly).toBe(true);
		expect(rows().map((row) => row.textContent)).toEqual([
			"「a.md」をゴミ箱へ移動します。",
			"元に戻せません。",
			"ゴミ箱に移動するCtrl+Enter",
			"キャンセルEsc",
		]);
	});

	it("Ctrl+Enter で実行して閉じる", async () => {
		const { onConfirm, input } = await open();
		key(input, "Enter", { ctrlKey: true });
		expect(onConfirm).toHaveBeenCalledOnce();
		expect(document.querySelector(".suggestion-item")).toBeNull();
	});

	it("Enter だけでは実行せず、押すキーを案内する", async () => {
		const { onConfirm, input, rows } = await open();
		key(input, "Enter");
		rows()[2].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
		expect(onConfirm).not.toHaveBeenCalled();
		expect(Notice).toHaveBeenCalledWith(
			"Ctrl+Enter を押すと、「ゴミ箱に移動する」を実行します。",
		);
		expect(document.querySelector(".suggestion-item")).not.toBeNull();
	});

	it("キャンセルの行では、Ctrl+Enter でも実行せず閉じる", async () => {
		const { onConfirm, input } = await open();
		key(input, "ArrowDown");
		key(input, "ArrowDown");
		key(input, "ArrowDown");
		key(input, "Enter", { ctrlKey: true });
		expect(onConfirm).not.toHaveBeenCalled();
		expect(document.querySelector(".suggestion-item")).toBeNull();
	});

	it("Esc では実行せずに閉じる", async () => {
		const { onConfirm, input } = await open();
		key(input, "Escape");
		expect(onConfirm).not.toHaveBeenCalled();
		expect(document.querySelector(".suggestion-item")).toBeNull();
	});
});
