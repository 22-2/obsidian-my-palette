import { Notice, type App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal } from "src/tags/TagSelectionModal";
import { installObsidianDom } from "src/ui/testing/obsidianDom";
import {
	clickPaletteMenuItem,
	clickPaletteMenuItemAt,
	isPaletteMenuOpen,
	paletteMenuTitles,
} from "src/ui/testing/paletteMenuDom";
import { createSelectorPlugin } from "src/ui/testing/selectorPlugin";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	Notice: vi.fn(),
}));

const choices: TagChoice[] = [
	{ tag: "alpha", count: 2, registered: false, reason: "recent" },
	{ tag: "beta", count: 1, registered: false, appliedCount: 1 },
	{ tag: "mine", count: 5, registered: true },
];

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"Node",
		"HTMLElement",
		"Event",
		"KeyboardEvent",
		"MouseEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
	vi.mocked(Notice).mockClear();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

const flush = async () => {
	for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
};

async function open(
	targetCount = 1,
	plugin = createSelectorPlugin({} as App),
	candidates: readonly TagChoice[] = choices,
) {
	const modal = new TagSelectionModal(
		plugin,
		candidates,
		"Target: note.md",
		targetCount,
		async () => undefined,
	);
	const result = modal.openAndWaitChanges();
	await flush();
	const rows = () => [...modal.modalEl.querySelectorAll<HTMLElement>(".suggestion-item")];
	const labels = () => rows().map((row) => row.textContent);
	const checked = () =>
		rows()
			.filter((row) => row.classList.contains("is-checked"))
			.map((row) => row.querySelector(".my-palette-suggestion__label")?.textContent);
	const button = () => modal.modalEl.querySelector<HTMLElement>(".my-palette-checked-button")!;
	const key = (name: string, options: KeyboardEventInit = {}) =>
		modal.inputEl.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: name,
				bubbles: true,
				cancelable: true,
				...options,
			}),
		);
	const mouse = (target: Element, type: string, options: MouseEventInit = {}) =>
		target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
	const type = async (value: string) => {
		modal.inputEl.value = value;
		modal.inputEl.dispatchEvent(new Event("input"));
		await flush();
	};
	return { plugin, modal, result, rows, labels, checked, button, key, mouse, type };
}

describe("タグ選択モーダル", () => {
	it("タグをアクティブにしたり選択モードを終了したりせずに、コア検索を通じてタグをプレビューします。", async () => {
		const openGlobalSearch = vi.fn();
		const plugin = createSelectorPlugin({
			internalPlugins: { getEnabledPluginById: () => ({ openGlobalSearch }) },
		} as unknown as App);
		const f = await open(1, plugin);
		f.key("ArrowDown");
		f.modal.inputEl.focus();
		f.key("ArrowRight", { isComposing: true });
		f.key("ArrowRight", { ctrlKey: true });
		expect(openGlobalSearch).not.toHaveBeenCalled();
		f.key("ArrowRight");
		await flush();
		expect(openGlobalSearch).toHaveBeenCalledExactlyOnceWith("tag:#alpha", false);
		expect(document.activeElement).toBe(f.modal.inputEl);
		expect(f.modal.inputEl.readOnly).toBe(true);
		expect(f.checked()).toEqual(["#mine"]);
		expect(f.modal.modalEl.isConnected).toBe(true);
		f.modal.close();
	});

	it("挿入ショートカットとターゲット コンテキストを独自のヘルプに保持します", async () => {
		const f = await open();
		f.mouse(f.modal.modalEl.querySelector(".my-palette-options-button")!, "click");
		clickPaletteMenuItem("ヘルプ");
		const help = document.querySelector(".my-palette-help-modal")!;
		expect(help.textContent).toContain("タグ挿入セレクター のヘルプ");
		expect(help.textContent).toContain("Target: note.md");
		expect(help.textContent).toContain("入力モードに戻る");
		expect(help.textContent).toContain("このセレクターを閉じずに、コア検索でタグをプレビュー");
		expect(help.textContent).toContain("Space");
		expect(help.textContent).toContain("Ctrl+Enter");
		expect(f.modal.modalEl.textContent).not.toContain("Space: check");
		f.modal.close();
	});

	it("共有アクションボタンに挿入アクションとチェックアクションを提供します", async () => {
		const f = await open();
		const actionButton = f.modal.modalEl.querySelector<HTMLElement>(
			".my-palette-options-button",
		)!;
		f.mouse(actionButton, "click");
		expect(paletteMenuTitles()).toEqual([
			"検索の一致を強調",
			"チェック",
			"追加 1 件",
			"変更を取り消す",
			"プラグインの設定を開く",
			"ヘルプ",
			"検索履歴を消去",
		]);
		clickPaletteMenuItem("チェック");
		expect(f.checked()).toEqual(["#alpha", "#mine"]);
		f.mouse(actionButton, "click");
		expect(paletteMenuTitles()).toContain("追加 1 件(チェック済み)");
		clickPaletteMenuItem("追加 1 件(チェック済み)");
		await expect(f.result).resolves.toEqual({ add: ["alpha"], remove: [] });
	});

	it("チェックを破棄したりタグを挿入したりせずにタグ履歴を復元します", async () => {
		const f = await open();
		await f.type("#fresh");
		f.key("ArrowUp");
		f.key(" ");
		f.key("f");
		await f.type("");
		f.key("r", { ctrlKey: true });
		f.key("Enter");
		await flush();
		expect(f.modal.inputEl.value).toBe("#fresh");
		expect(f.checked()).toEqual(["#fresh"]);
		expect(f.modal.modalEl.isConnected).toBe(true);
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["fresh"], remove: [] });
	});

	it.each(["ArrowUp", "ArrowDown"])(
		"starts selection at the first row with %s",
		async (arrow) => {
			const f = await open();
			expect(f.modal.modalEl.classList.contains("is-input-mode")).toBe(true);
			f.key(arrow);
			expect(f.modal.modalEl.classList.contains("is-input-mode")).toBe(false);
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			f.key("ArrowDown");
			expect(f.rows()[1].classList.contains("is-active")).toBe(true);
			f.key("f");
			expect(f.modal.modalEl.classList.contains("is-input-mode")).toBe(true);
			f.key(arrow);
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			expect(f.rows()[1].classList.contains("is-selected")).toBe(false);
			f.key("Enter");
			await expect(f.result).resolves.toEqual({ add: ["alpha"], remove: [] });
		},
	);

	it("入力モードでスペースと f を許可し、それらを選択コマンドとして使用します", async () => {
		const f = await open();
		expect(f.modal.inputEl.readOnly).toBe(false);
		expect(f.key(" ")).toBe(true);
		expect(f.key("f")).toBe(true);
		await f.type("alpha");
		f.key("ArrowUp", { isComposing: true });
		expect(f.modal.inputEl.readOnly).toBe(false);
		f.key("ArrowUp");
		expect(f.modal.inputEl.readOnly).toBe(true);
		expect(f.modal.modalEl.querySelector(".my-palette-status-bar__mode")).toBeNull();
		f.key(" ", { isComposing: true });
		expect(f.checked()).toEqual([]);
		expect(f.key(" ")).toBe(false);
		expect(f.checked()).toEqual(["#alpha"]);
		f.key(" ", { repeat: true });
		expect(f.checked()).toEqual(["#alpha"]);
		expect(f.key("f")).toBe(false);
		expect(f.modal.inputEl.readOnly).toBe(false);
		expect(f.modal.inputEl.value).toBe("alpha");
		expect(f.modal.modalEl.textContent).not.toContain("↑/↓: select");
		f.key("ArrowDown");
		f.mouse(f.modal.inputEl, "mousedown");
		expect(f.modal.inputEl.readOnly).toBe(false);
		f.modal.close();
	});

	it("再度開くと入力モードが再び開始されます", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.modal.close();
		f.modal.open();
		await flush();
		expect(f.modal.inputEl.readOnly).toBe(false);
		f.key("ArrowUp");
		f.key(" ");
		expect(f.checked()).toEqual(["#alpha", "#mine"]);
		f.modal.close();
	});

	it("タグを閉じずにチェックし、チェックしたタグを Ctrl+Enter で実行します", async () => {
		const f = await open();
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		// There is no confirm row; the cursor stays on the checked tag.
		expect(f.labels()[0]).toContain("#alpha");
		expect(f.checked()).toEqual(["#alpha", "#mine"]);
		f.key("ArrowDown");
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual(["#alpha", "#beta", "#mine"]);
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["alpha", "beta"], remove: [] });
	});

	it.each(["Enter", "NumpadEnter"])("immediately inserts a new tag with %s", async (code) => {
		const f = await open();
		await f.type("#fresh");
		f.key("Enter", { code });
		await expect(f.result).resolves.toEqual({ add: ["fresh"], remove: [] });
	});

	it.each(["Enter", "NumpadEnter"])(
		"warns on %s with highlighted rows and inserts them with Ctrl+Enter",
		async (code) => {
			const f = await open();
			f.key("ArrowDown");
			f.key("ArrowDown", { shiftKey: true });
			f.key("Enter", { code });
			await flush();
			expect(Notice).toHaveBeenCalledExactlyOnceWith(
				expect.stringContaining("Enter では「#beta」だけを追加します。"),
			);
			expect(f.modal.modalEl.isConnected).toBe(true);
			expect(f.checked()).toEqual(["#mine"]);
			f.key("Enter", { ctrlKey: true });
			await expect(f.result).resolves.toEqual({ add: ["alpha", "beta"], remove: [] });
		},
	);

	it("Enter 警告の後もチェックされたタグを保持し、強調表示された行よりもタグを優先します。", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.key("ArrowDown", { shiftKey: true });
		f.key(" ");
		await flush();
		f.key("f");
		await f.type("fresh");
		f.key("ArrowDown");
		f.key("ArrowDown");
		f.key("ArrowDown");
		f.key("Enter");
		await flush();
		expect(Notice).toHaveBeenCalledExactlyOnceWith(
			expect.stringContaining("Enter では「#fresh」だけを追加します。"),
		);
		expect(f.modal.modalEl.isConnected).toBe(true);
		expect(f.checked()).toEqual(["#alpha", "#beta"]);
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["alpha", "beta"], remove: [] });
	});

	it("複数選択の警告の後に、強調表示された 1 つの行を挿入できます。", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.key("ArrowDown", { shiftKey: true });
		f.key("Enter");
		await flush();
		f.key("ArrowUp");
		f.key("Enter");
		await expect(f.result).resolves.toEqual({ add: ["alpha"], remove: [] });
		expect(Notice).toHaveBeenCalledTimes(1);
	});

	it("Enterで登録済みのタグを削除し、チェックが外されるので閉じます。", async () => {
		const f = await open();
		await f.type("mine");
		f.key("Enter");
		await expect(f.result).resolves.toEqual({ add: [], remove: ["mine"] });
	});

	it("登録されたタグをチェックしたままにし、チェックを外すまで何も実行しません。", async () => {
		const f = await open();
		await f.type("mine");
		f.key("Enter", { ctrlKey: true });
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("選択したすべての行を一度にチェックし、次のスペースでチェックを外します。", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.key("ArrowDown", { shiftKey: true });
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual(["#alpha", "#beta", "#mine"]);
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual(["#mine"]);
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("チェックボックスが押された場合、クリックされた行のみをチェックします", async () => {
		const f = await open();
		f.mouse(f.rows()[1].querySelector(".my-palette-suggestion__icon")!, "mousedown", {
			button: 0,
		});
		await flush();
		expect(f.checked()).toEqual(["#beta", "#mine"]);
		f.key("Escape");
		await expect(f.result).resolves.toBeNull();
	});

	it("バッジにはタグが部分的に適用されていますが、選択可能な状態が保たれています", async () => {
		const f = await open(2);
		expect(f.labels()[1]).toContain("On 1/2 notes");
		expect(f.rows()[1].classList.contains("is-applied")).toBe(false);
		expect(f.rows().at(-1)?.classList.contains("is-applied")).toBe(true);
		f.modal.close();
	});

	it("1 行のチェック メニューと複数選択の一括チェック メニューを示します。", async () => {
		const f = await open();
		f.mouse(f.rows()[0], "contextmenu", { button: 2 });
		expect(paletteMenuTitles()).toEqual(["チェック", "追加 1 件"]);
		f.mouse(f.rows()[0], "mousedown");
		f.mouse(f.rows()[1], "mousedown", { shiftKey: true });
		f.mouse(f.rows()[1], "contextmenu", { button: 2 });
		expect(paletteMenuTitles()).toContain("チェック (2 件選択中)");
		expect(paletteMenuTitles()).toContain("追加 2 件");
		clickPaletteMenuItem("チェック (2 件選択中)");
		await flush();
		expect(f.checked()).toEqual(["#alpha", "#beta", "#mine"]);
		f.mouse(f.rows()[1], "contextmenu", { button: 2 });
		expect(paletteMenuTitles()).toEqual([
			"チェックを外す (2 件選択中)",
			"追加 2 件(チェック済み)",
			"タグを削除",
		]);
		f.modal.close();
	});

	it("行が押されると、開いているメニューが閉じます", async () => {
		const f = await open();
		f.mouse(f.rows()[0], "contextmenu", { button: 2 });
		expect(isPaletteMenuOpen()).toBe(true);
		f.mouse(f.rows()[1], "mousedown");
		expect(isPaletteMenuOpen()).toBe(false);
		f.modal.close();
	});

	it("入力ボタンからチェックされたタグをプレビューし、実行またはクリアできます。", async () => {
		const f = await open();
		expect(f.button().hidden).toBe(true);
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		expect(f.button().hidden).toBe(false);
		expect(f.button().textContent).toBe("+1");
		f.mouse(f.button(), "click");
		expect(paletteMenuTitles()).toEqual([
			"追加 1 件(チェック済み)",
			"#alpha",
			"変更を取り消す",
		]);
		clickPaletteMenuItem("変更を取り消す");
		await flush();
		expect(f.checked()).toEqual(["#mine"]);
		expect(f.button().hidden).toBe(true);
		f.key(" ");
		await flush();
		f.mouse(f.button(), "click");
		clickPaletteMenuItemAt(0);
		await expect(f.result).resolves.toEqual({ add: ["alpha"], remove: [] });
	});

	it("入力が変更された後も、チェックされた新しいタグをリストに保持します。", async () => {
		const f = await open();
		await f.type("fresh");
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		f.key("f");
		await f.type("");
		expect(f.checked()).toEqual(["#fresh", "#mine"]);
		// The check survives the new list, and the tag can still be run.
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["fresh"], remove: [] });
	});

	it("50 個のタグが固定された後も、チェックされていない候補にアクセスできるようにします", async () => {
		const candidates = Array.from({ length: 51 }, (_, index) => ({
			tag: `tag${index}`,
			count: 1,
			registered: false,
		}));
		const f = await open(1, undefined, candidates);
		expect(f.rows()).toHaveLength(50);
		f.key("ArrowDown");
		for (let index = 1; index < 50; index++) f.key("ArrowDown", { shiftKey: true });
		f.key(" ");
		await flush();
		expect(f.checked()).toHaveLength(50);
		expect(f.rows()).toHaveLength(51);
		f.mouse(f.rows()[50].querySelector(".my-palette-suggestion__icon")!, "mousedown");
		await flush();
		expect(f.checked()).toHaveLength(51);
		f.key("f");
		await f.type("fresh");
		expect(f.rows()).toHaveLength(52);
		f.mouse(f.rows()[51].querySelector(".my-palette-suggestion__icon")!, "mousedown");
		await flush();
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({
			add: [...candidates.map(({ tag }) => tag), "fresh"],
			remove: [],
		});
	});

	it("チェックされたタグを所定の位置に保持し、次の検索時に一致するタグの上に固定します。", async () => {
		const f = await open();
		f.key("ArrowDown");
		f.key("ArrowDown");
		f.key(" ");
		await flush();
		// Checking leaves the rows and the cursor where they were.
		expect(f.labels()[1]).toContain("#beta");
		expect(f.rows()[1].classList.contains("is-active")).toBe(true);
		f.key("f");
		await f.type("fresh");
		expect(f.labels()[0]).toContain("#beta");
		f.key("ArrowDown");
		f.key("ArrowDown");
		f.key(" ");
		await flush();
		f.key("f");
		await f.type("alpha");
		expect(f.checked()).toEqual(["#beta", "#fresh"]);
		expect(f.labels().slice(0, 2)).toEqual([
			expect.stringContaining("#beta"),
			expect.stringContaining("#fresh"),
		]);
		f.mouse(f.rows()[1].querySelector(".my-palette-suggestion__icon")!, "mousedown");
		await flush();
		expect(f.labels().join(" ")).not.toContain("#fresh");
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["beta"], remove: [] });
	});

	it("チェックされたタグと強調表示されたタグを行メニューから一緒に実行します", async () => {
		const f = await open();
		f.mouse(f.rows()[0].querySelector(".my-palette-suggestion__icon")!, "mousedown", {
			button: 0,
		});
		await flush();
		f.mouse(f.rows()[1], "mousedown");
		f.mouse(f.rows()[1], "contextmenu", { button: 2 });
		clickPaletteMenuItem("追加 2 件");
		await expect(f.result).resolves.toEqual({ add: ["alpha", "beta"], remove: [] });
	});

	it("登録されたタグのチェックを外し、Ctrl+Enter で削除を実行します。", async () => {
		const f = await open();
		await f.type("mine");
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual([]);
		expect(f.rows()[0].classList.contains("is-pending-removal")).toBe(true);
		expect(f.button().textContent).toBe("−1");
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: [], remove: ["mine"] });
	});

	it("追加と削除を一緒に実行し、両方をフッターに表示します", async () => {
		const f = await open();
		f.key("ArrowUp");
		f.key(" ");
		await flush();
		f.key("ArrowDown");
		f.key("ArrowDown");
		f.key(" ");
		await flush();
		expect(f.checked()).toEqual(["#alpha"]);
		expect(f.button().textContent).toBe("+1 −1");
		f.key("Enter", { ctrlKey: true });
		await expect(f.result).resolves.toEqual({ add: ["alpha"], remove: ["mine"] });
	});
});
