import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSuggestModal, type SuggestModalProps } from "src/ui/baseSuggestModal";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import { installObsidianDom } from "src/ui/testing/obsidianDom";
import { DEFAULT_HOTKEYS, type PaletteHotkeys } from "src/ui/hotkeys";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

const items = ["alpha", "beta", "gamma", "delta"];
const cleanups: (() => void)[] = [];

class TestModal extends BaseSuggestModal<string> {
	readonly choose = vi.fn();
	readonly middle = vi.fn();
	readonly context = vi.fn();
	readonly resultFocus = vi.fn();
	readonly preview = vi.fn();
	initialRange?: [number, number];
	suffix = "";
	search = vi.fn((_query: string): string[] | Promise<string[]> => items);
	constructor(props: SuggestModalProps<string> = {}) {
		super(props, {} as App);
	}
	getSuggestions(query: string) {
		return this.search(query);
	}
	renderSuggestion(item: string, el: HTMLElement) {
		el.setText(`${this.query}:${item}${this.suffix}`);
	}
	protected override async onItemActivated(item: string) {
		this.choose(item);
	}
	protected override handlesSuggestionMiddleClick() {
		return true;
	}
	protected override handlesSuggestionContextMenu() {
		return true;
	}
	protected override async onSuggestionMiddleClick(item: string) {
		this.middle(item);
	}
	protected override onSuggestionContextMenu(item: string) {
		this.context(item, this.getSelectedItems());
	}
	protected override onResultFocus() {
		this.resultFocus();
	}
	protected override handlesSuggestionPreview() {
		return true;
	}
	protected override async onSuggestionPreview(item: string) {
		this.preview(item);
	}
	protected override getInitialInputSelectionRange(): [number, number] {
		return this.initialRange ?? super.getInitialInputSelectionRange();
	}
	selectedItems() {
		return this.getSelectedItems();
	}
	refresh() {
		this.refreshSuggestions();
	}
	refreshKeepingSelection() {
		this.refreshSuggestionsKeepingSelection((a, b) => a === b);
	}
	rerender() {
		this.rerenderVisibleSuggestions();
	}
	setCount(total: number) {
		this.updateResultCount(total);
	}
	matchQuery(query: string) {
		this.updateMatchQuery(query);
	}
}

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
});
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	document.body.replaceChildren();
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

async function fixture(
	surface: "modal" | "view",
	selectionMode: "single" | "extended" = "extended",
	interactionModes = false,
	getHotkeys?: () => PaletteHotkeys,
) {
	const modal =
		surface === "modal"
			? new TestModal({ selectionMode, interactionModes, getHotkeys })
			: undefined;
	const root = modal?.modalEl ?? document.body.appendChild(createDiv());
	const choose = modal?.choose ?? vi.fn();
	const middle = modal?.middle ?? vi.fn();
	const context = modal?.context ?? vi.fn();
	const resultFocus = modal?.resultFocus ?? vi.fn();
	const panel = modal
		? undefined
		: new SuggestionPanel<string>(root, {
				getHotkeys,
				surface,
				selectionMode,
				interactionModes,
				onInput: vi.fn(),
				renderSuggestion: (item, el) => el.setText(item),
				onChoose: (item) => {
					choose(item);
				},
				onMiddleClick: (item) => {
					middle(item);
				},
				onContextMenu: (item, _event, selected) => {
					context(item, selected);
				},
				onResultFocus: () => {
					resultFocus();
				},
			});
	if (modal) modal.open();
	else {
		panel!.load();
		panel!.setResults({ items });
	}
	await Promise.resolve();
	cleanups.push(() => (modal ? modal.close() : panel!.unload()));
	return {
		root,
		input: modal?.inputEl ?? panel!.inputEl,
		modal,
		panel,
		choose,
		middle,
		context,
		resultFocus,
		rows: () => [...root.querySelectorAll<HTMLElement>(".suggestion-item")],
		selection: () => modal?.selectedItems() ?? panel!.getSelectedItems(),
	};
}

function mouse(el: HTMLElement, type: string, options: MouseEventInit = {}) {
	el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }));
}
function key(el: HTMLElement, name: string, options: KeyboardEventInit = {}) {
	const event = new KeyboardEvent("keydown", {
		key: name,
		bubbles: true,
		cancelable: true,
		...options,
	});
	el.dispatchEvent(event);
	return event;
}

describe.each(["modal", "view"] as const)("%s suggestion interactions", (surface) => {
	it.each(["single", "extended"] as const)(
		"shares input/list modes in %s selection",
		async (selectionMode) => {
			const f = await fixture(surface, selectionMode, true);
			expect(f.root.classList.contains("is-input-mode")).toBe(true);
			expect(key(f.input, " ").defaultPrevented).toBe(false);
			expect(key(f.input, "f").defaultPrevented).toBe(false);
			key(f.input, "ArrowDown", { isComposing: true });
			expect(f.input.readOnly).toBe(false);
			key(f.input, "ArrowDown");
			expect(f.input.readOnly).toBe(true);
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			key(f.input, "ArrowDown");
			expect(f.rows()[1].classList.contains("is-active")).toBe(true);
			if (selectionMode === "extended") {
				key(f.input, " ");
				expect(f.selection()).toEqual([]);
				key(f.input, " ");
				expect(f.selection()).toEqual(["beta"]);
			}
			key(f.input, "f");
			expect(f.input.readOnly).toBe(false);
			expect(f.root.classList.contains("is-input-mode")).toBe(true);
			key(f.input, "ArrowUp");
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			mouse(f.input, "mousedown");
			expect(f.input.readOnly).toBe(false);
		},
	);

	it.each(["single", "extended"] as const)(
		"keeps the first row ready while typing without modes in %s selection",
		async (selectionMode) => {
			const f = await fixture(surface, selectionMode);
			expect(f.root.classList.contains("is-input-mode")).toBe(false);
			expect(f.root.querySelector(".my-palette-status-bar__mode")).toBeNull();
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			expect(key(f.input, " ").defaultPrevented).toBe(false);
			expect(key(f.input, "f").defaultPrevented).toBe(false);
			key(f.input, "ArrowDown");
			expect(f.input.readOnly).toBe(false);
			expect(f.rows()[1].classList.contains("is-active")).toBe(true);
			expect(key(f.input, "f").defaultPrevented).toBe(false);
			key(f.input, "ArrowUp");
			key(f.input, "ArrowUp");
			expect(f.rows()[0].classList.contains("is-active")).toBe(true);
			key(f.input, "Enter");
			expect(f.choose).toHaveBeenCalledExactlyOnceWith("alpha");
		},
	);

	it("プレス時に選択し、修飾子で拡張し、一括コンテキスト選択を保持します", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "mousedown");
		mouse(f.rows()[3], "mousedown", { shiftKey: true });
		expect(f.selection()).toEqual(["beta", "gamma", "delta"]);
		mouse(f.rows()[2], "mousedown", { ctrlKey: true });
		expect(f.selection()).toEqual(["beta", "delta"]);
		mouse(f.rows()[3], "mousedown", { button: 2 });
		mouse(f.rows()[3], "contextmenu", { button: 2 });
		expect(f.context).toHaveBeenCalledWith("delta", ["beta", "delta"]);
		expect(f.choose).not.toHaveBeenCalled();
		mouse(f.rows()[0], "contextmenu", { button: 2 });
		expect(f.selection()).toEqual(["alpha"]);
	});
	it("Ctrl+K でキーボード選択のコンテキスト メニューを開きます", async () => {
		const f = await fixture(surface);
		key(f.input, "ArrowDown");
		key(f.input, "ArrowDown", { shiftKey: true });
		const event = key(f.input, "k", { ctrlKey: true });
		expect(event.defaultPrevented).toBe(true);
		expect(f.context).toHaveBeenCalledExactlyOnceWith("gamma", ["beta", "gamma"]);
		mouse(f.rows()[2], "mousedown");
		mouse(f.rows()[2], "click");
		mouse(f.rows()[2], "dblclick");
		expect(f.choose).toHaveBeenCalledExactlyOnceWith("gamma");
	});
	it("ダブルクリックまたは Enter キーを押した場合にのみ拡張選択をアクティブにします", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "mousedown");
		mouse(f.rows()[1], "click");
		expect(f.choose).not.toHaveBeenCalled();
		mouse(f.rows()[1], "dblclick");
		expect(f.choose).toHaveBeenCalledExactlyOnceWith("beta");
		key(f.input, "Enter");
		expect(f.choose).toHaveBeenCalledTimes(2);
	});
	it("プライマリアクティベーションに失敗せずに中クリックを 1 回開きます", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "mousedown", { button: 1 });
		mouse(f.rows()[1], "click", { button: 1 });
		mouse(f.rows()[1], "auxclick", { button: 1 });
		expect(f.middle).toHaveBeenCalledExactlyOnceWith("beta");
		expect(f.choose).not.toHaveBeenCalled();
	});
	it("バックグラウンドタブを開かずに右クリックのフォローアップイベントを消費します", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[0], "mousedown", { button: 2 });
		mouse(f.rows()[0], "contextmenu", { button: 2 });
		mouse(f.rows()[0], "click", { button: 2 });
		mouse(f.rows()[0], "auxclick", { button: 2 });
		expect(f.context).toHaveBeenCalledTimes(1);
		expect(f.middle).not.toHaveBeenCalled();
		expect(f.choose).not.toHaveBeenCalled();
	});
	it.each(["click", "auxclick"])("opens a standalone middle %s once", async (type) => {
		const f = await fixture(surface);
		mouse(f.rows()[1], type, { button: 1 });
		mouse(f.rows()[1], "click");
		mouse(f.rows()[1], "auxclick", { button: 1 });
		expect(f.middle).toHaveBeenCalledExactlyOnceWith("beta");
		expect(f.choose).not.toHaveBeenCalled();
	});
	it("スタンドアロンの右補助クリックを中クリックとして扱いません。", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "auxclick", { button: 2 });
		expect(f.middle).not.toHaveBeenCalled();
		expect(f.choose).not.toHaveBeenCalled();
	});
	it("キーボードの選択を拡張し、Ctrl を押しながら移動している間は選択を維持し、IME を無視します", async () => {
		const f = await fixture(surface, "extended", true);
		key(f.input, "ArrowDown");
		key(f.input, "ArrowDown", { shiftKey: true });
		expect(f.selection()).toEqual(["alpha", "beta"]);
		key(f.input, "ArrowDown", { ctrlKey: true });
		expect(f.selection()).toEqual(["alpha", "beta"]);
		key(f.input, "Enter", { isComposing: true });
		expect(f.choose).not.toHaveBeenCalled();
		key(f.input, "Enter");
		expect(f.choose).toHaveBeenCalledExactlyOnceWith("gamma");
		expect(f.resultFocus).toHaveBeenCalledTimes(4);
	});
	it("最初の行で ArrowUp を押すと入力モードに戻ります", async () => {
		const f = await fixture(surface, "extended", true);
		key(f.input, "ArrowDown");
		key(f.input, "ArrowDown");
		key(f.input, "ArrowUp");
		expect(f.input.readOnly).toBe(true);
		expect(f.rows()[0].classList.contains("is-active")).toBe(true);
		const event = key(f.input, "ArrowUp");
		expect(event.defaultPrevented).toBe(true);
		expect(f.input.readOnly).toBe(false);
		expect(f.root.classList.contains("is-input-mode")).toBe(true);
		expect(f.rows()[0].classList.contains("is-active")).toBe(true);
	});
	it.each([true, false])(
		"returns focus to the input when empty list space is pressed (modes: %s)",
		async (interactionModes) => {
			const f = await fixture(surface, "extended", interactionModes);
			f.input.blur();
			const space = f.root.querySelector<HTMLElement>(".prompt-results")!;
			mouse(space, "mousedown");
			expect(document.activeElement).toBe(f.input);
			// Selection mode keeps typing blocked; without modes the input stays editable.
			expect(f.input.readOnly).toBe(interactionModes);
			key(f.input, "ArrowDown");
			expect(f.rows()[1].classList.contains("is-active")).toBe(true);
			expect(f.choose).not.toHaveBeenCalled();
		},
	);
	it("空のモーダルスペースとテーブルヘッダーの履歴フォーカス境界を維持します", async () => {
		const f = await fixture(surface);
		const header = f.root.querySelector<HTMLElement>(".prompt-results")!.createDiv("header");
		mouse(header, "mousedown");
		expect(f.resultFocus).toHaveBeenCalledTimes(surface === "modal" ? 1 : 0);
		expect(f.choose).not.toHaveBeenCalled();
	});
});

it("単一選択モーダルのクリック アクティベーションとビューのプレス アクティベーションを維持します。", async () => {
	for (const surface of ["modal", "view"] as const) {
		const f = await fixture(surface, "single");
		mouse(f.rows()[1], "mousedown");
		expect(f.choose).toHaveBeenCalledTimes(surface === "modal" ? 0 : 1);
		mouse(f.rows()[1], "click");
		expect(f.choose).toHaveBeenCalledExactlyOnceWith("beta");
	}
});

it("復元されたポップアウト ウィンドウで作成されたサイドバーの結果を選択して開きます", async () => {
	const mainDocument = document;
	const mainElement = Element;
	const mainHTMLElement = HTMLElement;
	const popout = new Window();
	vi.stubGlobal("document", popout.document);
	vi.stubGlobal("Element", popout.Element);
	vi.stubGlobal("HTMLElement", popout.HTMLElement);
	installObsidianDom();
	const f = await fixture("view");
	vi.stubGlobal("document", mainDocument);
	// Happy DOM shares Element across windows; give the main realm its own
	// constructor so native instanceof rejects the popout's nodes as Electron does.
	vi.stubGlobal("Element", class Element extends mainElement {});
	vi.stubGlobal("HTMLElement", mainHTMLElement);

	expect(f.rows()[1].ownerDocument).not.toBe(mainDocument);
	mouse(f.rows()[1], "mousedown");
	mouse(f.rows()[1], "click");
	expect(f.selection()).toEqual(["beta"]);
	mouse(f.rows()[1], "dblclick");
	expect(f.choose).toHaveBeenCalledExactlyOnceWith("beta");
	mouse(f.rows()[2], "mousedown", { button: 1 });
	mouse(f.rows()[2], "auxclick", { button: 1 });
	expect(f.middle).toHaveBeenCalledExactlyOnceWith("gamma");
	mouse(f.rows()[3], "contextmenu", { button: 2 });
	expect(f.context).toHaveBeenCalledWith("delta", ["delta"]);
});

it("モーダルな Home/End スコープの処理を保持し、エスケープ時に閉じます", async () => {
	const f = await fixture("modal");
	f.input.value = "query";
	key(f.input, "Home");
	const scope = f.modal!.scope as unknown as {
		keys: { key: string; modifiers: string; func: (event: KeyboardEvent) => unknown }[];
	};
	const home = scope.keys.find((handler) => handler.key === "Home" && handler.modifiers === "")!;
	const end = scope.keys.find(
		(handler) => handler.key === "End" && handler.modifiers === "Ctrl",
	)!;
	expect(home.func(new KeyboardEvent("keydown", { key: "Home" }))).toBeUndefined();
	const homeEvent = new KeyboardEvent("keydown", { key: "Home" });
	Object.defineProperty(homeEvent, "target", { value: f.input });
	expect(home.func(homeEvent)).toBe(false);
	expect(f.input.selectionStart).toBe(0);
	const endEvent = new KeyboardEvent("keydown", { key: "End", ctrlKey: true });
	Object.defineProperty(endEvent, "target", { value: f.input });
	expect(end.func(endEvent)).toBe(false);
	key(f.input, "Enter");
	expect(f.choose).toHaveBeenCalledExactlyOnceWith("delta");
	key(f.input, "Escape");
	expect(f.root.isConnected).toBe(false);
});

it("古い検索を破棄し、プロバイダーの一致クエリと合計を保持します。", async () => {
	const f = await fixture("modal");
	let resolveOld!: (items: string[]) => void;
	f.modal!.search.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				resolveOld = resolve;
			}),
	);
	f.input.value = "old";
	f.modal!.refresh();
	f.modal!.search.mockImplementationOnce(() => {
		f.modal!.matchQuery("parsed");
		f.modal!.setCount(120);
		return ["new"];
	});
	f.input.value = "prefix parsed";
	f.modal!.refresh();
	await Promise.resolve();
	resolveOld(["old"]);
	await Promise.resolve();
	expect(f.rows().map((row) => row.textContent)).toEqual(["parsed:new"]);
	expect(f.root.querySelector(".my-palette-status-bar__count")?.textContent).toBe("50 / 120");
});

it("開いたままの再レンダリング後に選択範囲とカーソルを同じアイテムに復元します", async () => {
	const f = await fixture("modal", "extended");
	mouse(f.rows()[1], "mousedown");
	mouse(f.rows()[2], "mousedown", { shiftKey: true });
	// The items move to other indexes so restoring by index would pick the wrong rows.
	f.modal!.search.mockReturnValue(["delta", "alpha", "beta", "gamma"]);
	f.modal!.refreshKeepingSelection();
	await Promise.resolve();
	expect(f.selection()).toEqual(["beta", "gamma"]);
	key(f.input, "Enter");
	expect(f.choose).toHaveBeenCalledWith("gamma");
});

it("拡張選択を失わずに行を所定の位置に再描画します", async () => {
	const f = await fixture("modal");
	mouse(f.rows()[1], "mousedown");
	mouse(f.rows()[3], "mousedown", { shiftKey: true });
	f.modal!.suffix = "!";
	f.modal!.rerender();
	expect(f.rows().map((row) => row.textContent)).toEqual([
		":alpha!",
		":beta!",
		":gamma!",
		":delta!",
	]);
	expect(f.selection()).toEqual(["beta", "gamma", "delta"]);
});

describe.each(["modal", "view"] as const)("%s preview transparency", (surface) => {
	it.each([
		["single", false],
		["single", true],
		["extended", false],
		["extended", true],
	] as const)(
		"restores %s selection with selection mode %s",
		async (selectionMode, selecting) => {
			const f = await fixture(surface, selectionMode, true);
			f.input.value = "query";
			if (selecting) key(f.input, "ArrowDown");
			const selection = f.selection();
			const container = f.modal?.containerEl ?? f.root;
			const hidden = () => container.classList.contains("is-preview-hidden");
			key(f.input, "h", { altKey: true, isComposing: true });
			key(f.input, "h", { altKey: true, ctrlKey: true });
			expect(hidden()).toBe(false);
			key(f.input, "h", { altKey: true });
			expect(hidden()).toBe(true);
			expect(f.input.readOnly).toBe(selecting);
			expect(f.input.value).toBe("query");
			key(f.input, "h", { altKey: true, repeat: true });
			expect(hidden()).toBe(true);
			window.dispatchEvent(new KeyboardEvent("keyup", { key: "h", altKey: true }));
			expect(hidden()).toBe(false);
			expect(document.activeElement).toBe(f.input);
			expect(f.input.readOnly).toBe(selecting);
			expect(f.selection()).toEqual(selection);
			key(f.input, "h", { altKey: true });
			window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
			expect(hidden()).toBe(false);
			key(f.input, "h", { altKey: true });
			window.dispatchEvent(new Event("blur"));
			expect(hidden()).toBe(false);
			key(f.input, "h", { altKey: true });
			if (f.modal) f.modal.close();
			else f.panel!.unload();
			expect(hidden()).toBe(false);
			key(f.input, "h", { altKey: true });
			expect(hidden()).toBe(false);
			if (f.modal) f.modal.open();
			else f.panel!.load();
			expect(hidden()).toBe(false);
			key(f.input, "h", { altKey: true });
			expect(hidden()).toBe(true);
			window.dispatchEvent(new KeyboardEvent("keyup", { key: "h" }));
			expect(hidden()).toBe(false);
		},
	);
});

it("通常の H または Alt リリースでは別のパネルからフォーカスを奪いません。", async () => {
	const first = await fixture("view");
	const second = await fixture("view");
	first.input.focus();
	window.dispatchEvent(new KeyboardEvent("keyup", { key: "h" }));
	window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
	expect(document.activeElement).toBe(first.input);
	key(second.input, "h", { altKey: true });
	window.dispatchEvent(new KeyboardEvent("keyup", { key: "h" }));
	expect(document.activeElement).toBe(second.input);
	expect(first.root.classList.contains("is-preview-hidden")).toBe(false);
});

it("検索入力以外のコントロールからの Alt+H を処理します", async () => {
	const f = await fixture("view");
	const control = f.root.createEl("button");
	control.focus();
	expect(key(control, "h", { altKey: true }).defaultPrevented).toBe(true);
	expect(f.root.classList.contains("is-preview-hidden")).toBe(true);
	window.dispatchEvent(new KeyboardEvent("keyup", { key: "Alt" }));
	expect(f.root.classList.contains("is-preview-hidden")).toBe(false);
	expect(document.activeElement).toBe(f.input);
});

it.each(["modal", "view"] as const)(
	"applies live hide and mode bindings in the %s",
	async (surface) => {
		const hotkeys = structuredClone(DEFAULT_HOTKEYS);
		const f = await fixture(surface, "extended", true, () => hotkeys);
		hotkeys.hidePreview = { key: "N", modifiers: ["Alt"] };
		hotkeys.focusInput = { key: "G", modifiers: [] };
		hotkeys.toggleSelection = { key: "X", modifiers: [] };
		const container = f.modal?.containerEl ?? f.root;
		key(f.input, "h", { altKey: true });
		expect(container.classList.contains("is-preview-hidden")).toBe(false);
		key(f.input, "n", { altKey: true });
		expect(container.classList.contains("is-preview-hidden")).toBe(true);
		window.dispatchEvent(new KeyboardEvent("keyup", { key: "n", altKey: true }));
		expect(container.classList.contains("is-preview-hidden")).toBe(false);
		key(f.input, "ArrowDown");
		key(f.input, "f");
		expect(f.input.readOnly).toBe(true);
		key(f.input, "x");
		expect(f.selection()).toEqual([]);
		key(f.input, "g");
		expect(f.input.readOnly).toBe(false);
		hotkeys.hidePreview = null;
		key(f.input, "n", { altKey: true });
		expect(container.classList.contains("is-preview-hidden")).toBe(false);
	},
);

it("クエリの末尾から離れたカスタム バインディングを使用したプレビュー", async () => {
	const hotkeys = structuredClone(DEFAULT_HOTKEYS);
	hotkeys.preview = { key: "P", modifiers: ["Alt"] };
	const f = await fixture("modal", "extended", false, () => hotkeys);
	f.input.value = "query";
	f.input.setSelectionRange(0, 0);
	key(f.input, "ArrowRight");
	expect(f.modal!.preview).not.toHaveBeenCalled();
	key(f.input, "p", { altKey: true });
	await Promise.resolve();
	expect(f.modal!.preview).toHaveBeenCalledExactlyOnceWith("alpha");
});

it("モーダルを再度開くときにハンドラーまたはフッターを複製しません。", async () => {
	const f = await fixture("modal");
	f.modal!.close();
	f.modal!.open();
	await Promise.resolve();
	key(f.input, "Enter");
	expect(f.choose).toHaveBeenCalledExactlyOnceWith("alpha");
	key(f.input, "ArrowRight");
	expect(f.modal!.preview).toHaveBeenCalledTimes(1);
	expect(f.root.querySelectorAll(".my-palette-status-bar")).toHaveLength(1);
	f.modal!.close();
	key(f.input, "Enter");
	key(f.input, "ArrowRight");
	expect(f.choose).toHaveBeenCalledTimes(1);
	expect(f.modal!.preview).toHaveBeenCalledTimes(1);
});

it("初期入力に焦点を当て、ホストのプレフィックスを認識した選択範囲を保持します。", async () => {
	const modal = new TestModal({ initialInput: "> query" });
	modal.initialRange = [2, 7];
	cleanups.push(() => modal.close());
	modal.open();
	expect(document.activeElement).toBe(modal.inputEl);
	expect(modal.search).not.toHaveBeenCalled();
	await vi.runAllTimersAsync();
	expect(modal.search).toHaveBeenCalledExactlyOnceWith("> query");
	expect([modal.inputEl.selectionStart, modal.inputEl.selectionEnd]).toEqual([2, 7]);
});

it("モーダルが再度開かれた後、閉じられたセッションの検索はレンダリングされません。", async () => {
	const f = await fixture("modal");
	let resolveOld!: (items: string[]) => void;
	f.modal!.search.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				resolveOld = resolve;
			}),
	);
	f.input.dispatchEvent(new Event("input"));
	f.modal!.close();
	f.modal!.open();
	await Promise.resolve();
	resolveOld(["closed"]);
	await Promise.resolve();
	expect(f.rows()).toHaveLength(4);
	expect(f.rows().some((row) => row.textContent?.includes("closed"))).toBe(false);
});

it("カスタム テーブル レイアウトと表示される行の順序を選択可能な状態に保ちます", async () => {
	const f = await fixture("view");
	f.panel!.setResultsLayout({
		render: (container, visible, query, decorateRow) => {
			container.createDiv("header");
			for (const [index, item] of visible.entries()) {
				const row = container.createDiv({ text: `${query}:${item}` });
				decorateRow(row, index);
			}
		},
	});
	f.input.value = "raw query";
	f.panel!.setResults({ items: ["delta", "beta"], total: 70, query: "parsed" });
	expect(f.rows().map((row) => row.textContent)).toEqual(["parsed:delta", "parsed:beta"]);
	mouse(f.rows()[1], "mousedown");
	key(f.input, "Enter");
	expect(f.choose).toHaveBeenCalledExactlyOnceWith("beta");
	expect(f.rows()[1].getAttribute("role")).toBe("row");
	expect(f.root.querySelector(".my-palette-status-bar__count")?.textContent).toBe("50 / 70");
});
