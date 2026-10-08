import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BaseSuggestModal, type SuggestModalProps } from "src/ui/baseSuggestModal";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

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
	protected override onSelectionModalOpen() {
		this.registerSelectionDomEvent(this.inputEl, "keydown", (event) => {
			if (event.key === "ArrowRight") this.preview();
		});
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
) {
	const modal = surface === "modal" ? new TestModal({ selectionMode }) : undefined;
	const root = modal?.modalEl ?? document.body.appendChild(document.createElement("div"));
	const choose = modal?.choose ?? vi.fn();
	const middle = modal?.middle ?? vi.fn();
	const context = modal?.context ?? vi.fn();
	const resultFocus = modal?.resultFocus ?? vi.fn();
	const panel = modal
		? undefined
		: new SuggestionPanel<string>(root, {
				surface,
				selectionMode,
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
			const f = await fixture(surface, selectionMode);
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

	it("selects on press, extends with modifiers, and preserves bulk context selection", async () => {
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
	it("activates extended selections only on double-click or Enter", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "mousedown");
		mouse(f.rows()[1], "click");
		expect(f.choose).not.toHaveBeenCalled();
		mouse(f.rows()[1], "dblclick");
		expect(f.choose).toHaveBeenCalledExactlyOnceWith("beta");
		key(f.input, "Enter");
		expect(f.choose).toHaveBeenCalledTimes(2);
	});
	it("opens a middle-click once without falling through to primary activation", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "mousedown", { button: 1 });
		mouse(f.rows()[1], "click", { button: 1 });
		mouse(f.rows()[1], "auxclick", { button: 1 });
		expect(f.middle).toHaveBeenCalledExactlyOnceWith("beta");
		expect(f.choose).not.toHaveBeenCalled();
	});
	it("consumes right-click follow-up events without opening a background tab", async () => {
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
	it("does not treat a standalone right auxclick as a middle-click", async () => {
		const f = await fixture(surface);
		mouse(f.rows()[1], "auxclick", { button: 2 });
		expect(f.middle).not.toHaveBeenCalled();
		expect(f.choose).not.toHaveBeenCalled();
	});
	it("extends keyboard selection, keeps it while moving with Ctrl, and ignores IME", async () => {
		const f = await fixture(surface);
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
	it("keeps the history focus boundary for empty modal space and table headers", async () => {
		const f = await fixture(surface);
		const header = f.root.querySelector<HTMLElement>(".prompt-results")!.createDiv("header");
		mouse(header, "mousedown");
		expect(f.resultFocus).toHaveBeenCalledTimes(surface === "modal" ? 1 : 0);
		expect(f.choose).not.toHaveBeenCalled();
	});
});

it("keeps click activation for single-choice modals and press activation for views", async () => {
	for (const surface of ["modal", "view"] as const) {
		const f = await fixture(surface, "single");
		mouse(f.rows()[1], "mousedown");
		expect(f.choose).toHaveBeenCalledTimes(surface === "modal" ? 0 : 1);
		mouse(f.rows()[1], "click");
		expect(f.choose).toHaveBeenCalledExactlyOnceWith("beta");
	}
});

it("selects and opens sidebar results created in a restored popout window", async () => {
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

	expect(f.rows()[1] instanceof Element).toBe(false);
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

it("preserves modal Home/End scope handling and closes on Escape", async () => {
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

it("discards stale searches and preserves the provider's match query and total", async () => {
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

it("restores the selection and cursor to the same items after a keep-open rerender", async () => {
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

it("redraws rows in place without losing the extended selection", async () => {
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

it("does not duplicate handlers or the footer when reopening a modal", async () => {
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

it("focuses initial input and preserves a host's prefix-aware selection range", async () => {
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

it("does not render a closed session's search after the modal has reopened", async () => {
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

it("keeps custom table layouts and their displayed row order selectable", async () => {
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
