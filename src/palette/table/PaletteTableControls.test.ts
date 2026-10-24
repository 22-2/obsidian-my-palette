import type { App } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaletteResult } from "src/palette/results";
import { PaletteTableControls } from "src/palette/table/PaletteTableControls";
import { normalizePaletteTableState } from "src/palette/table/paletteTableModel";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", async () => ({
	...(await import("src/ui/testing/obsidianDom")),
	TFile: class {},
	Menu: class {},
}));

const cleanups: (() => void)[] = [];

beforeEach(() => {
	const dom = new Window();
	for (const name of ["document", "Element", "HTMLElement", "MouseEvent"] as const)
		vi.stubGlobal(name, dom[name]);
	installObsidianDom();
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	vi.unstubAllGlobals();
});

function fixture() {
	const root = document.body.appendChild(createDiv());
	const middle = vi.fn();
	const choose = vi.fn();
	const panel = new SuggestionPanel<PaletteResult>(root, {
		surface: "view",
		selectionMode: "extended",
		onInput: vi.fn(),
		renderSuggestion: vi.fn(),
		onChoose: choose,
		onMiddleClick: middle,
	});
	const controls = new PaletteTableControls(
		panel,
		{ vault: { getAbstractFileByPath: () => null } } as unknown as App,
		{
			initialState: normalizePaletteTableState({ sorting: [{ id: "name", desc: true }] }),
			presentation: (result) => ({ label: result.primary }),
			foldKana: () => false,
			onChange: vi.fn(),
			columnSet: () => "files",
		},
	);
	panel.load();
	controls.load();
	cleanups.push(() => {
		controls.unload();
		panel.unload();
	});
	const items: PaletteResult[] = ["alpha", "beta"].map((name) => ({
		id: name,
		mode: "file",
		primary: name,
		secondary: `${name}.md`,
		icon: "file",
		vaultPath: `${name}.md`,
	}));
	controls.setResults({ items });
	return { root, panel, controls, middle, choose, expected: items[1] };
}

function mouse(element: HTMLElement, type: string, button = 1) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, button });
	element.dispatchEvent(event);
	return event;
}

describe("テーブルの中クリック インタラクション", () => {
	it("復元されたポップアウト行と並べ替えヘッダーを処理します", () => {
		const mainDocument = document;
		const mainElement = Element;
		const mainHTMLElement = HTMLElement;
		const popout = new Window();
		vi.stubGlobal("document", popout.document);
		vi.stubGlobal("Element", popout.Element);
		vi.stubGlobal("HTMLElement", popout.HTMLElement);
		installObsidianDom();
		const f = fixture();
		vi.stubGlobal("document", mainDocument);
		// Happy DOM shares Element across windows; model Electron's separate
		// main-window constructor while keeping the popout document's own nodes.
		vi.stubGlobal("Element", class Element extends mainElement {});
		vi.stubGlobal("HTMLElement", mainHTMLElement);

		const cell = f.root.querySelector<HTMLElement>('td[data-column="path"]')!;
		expect(cell.ownerDocument).not.toBe(mainDocument);
		mouse(cell, "mousedown", 0);
		mouse(cell, "click", 0);
		expect(f.panel.getSelectedItems()).toEqual([f.expected]);
		mouse(cell, "dblclick", 0);
		expect(f.choose).toHaveBeenCalledExactlyOnceWith(f.expected, expect.any(MouseEvent));
		mouse(cell, "mousedown");
		mouse(cell, "auxclick");
		expect(f.middle).toHaveBeenCalledExactlyOnceWith(f.expected, expect.any(MouseEvent));
		mouse(f.root.querySelector<HTMLElement>('th button[data-column="name"]')!, "click", 0);
		expect(f.panel.getSelectedItem()?.primary).toBe("alpha");
	});

	it.each([
		"tr.suggestion-item",
		".my-palette-suggestion__label span",
		'td[data-column="path"]',
		'td[data-column="modified"]',
		'td[data-column="prior"]',
	])("opens the displayed result from %s once per gesture", (selector) => {
		const f = fixture();
		const target = f.root.querySelector<HTMLElement>(selector)!;
		for (let gesture = 1; gesture <= 2; gesture++) {
			expect(mouse(target, "mousedown").defaultPrevented).toBe(true);
			mouse(target, "click");
			mouse(target, "auxclick");
			expect(f.middle).toHaveBeenCalledTimes(gesture);
			expect(f.middle).toHaveBeenLastCalledWith(f.expected, expect.any(MouseEvent));
		}
		expect(f.choose).not.toHaveBeenCalled();
	});

	it.each(["click", "auxclick"])("opens a table cell from standalone %s", (type) => {
		const f = fixture();
		const cell = f.root.querySelector<HTMLElement>('td[data-column="path"]')!;
		mouse(cell, type);
		mouse(cell, "click", 0);
		mouse(cell, "auxclick");
		expect(f.middle).toHaveBeenCalledExactlyOnceWith(f.expected, expect.any(MouseEvent));
		expect(f.choose).not.toHaveBeenCalled();
	});

	it("ヘッダーの並べ替えでの中クリックを無視します。", () => {
		const f = fixture();
		const header = f.root.querySelector<HTMLElement>("th button")!;
		mouse(header, "mousedown");
		mouse(header, "click");
		mouse(header, "auxclick");
		expect(f.middle).not.toHaveBeenCalled();
		expect(f.choose).not.toHaveBeenCalled();
		expect(f.panel.getSelectedItem()).toBe(f.expected);
	});
});
