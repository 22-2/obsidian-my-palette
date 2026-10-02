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
	vi.stubGlobal("createDiv", (options: { cls: string }) => {
		const element = document.createElement("div");
		element.className = options.cls;
		return element;
	});
});

afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	vi.unstubAllGlobals();
});

function fixture() {
	const root = document.body.appendChild(document.createElement("div"));
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
			onChange: vi.fn(),
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
	return { root, panel, middle, choose, expected: items[1] };
}

function mouse(element: HTMLElement, type: string, button = 1) {
	const event = new MouseEvent(type, { bubbles: true, cancelable: true, button });
	element.dispatchEvent(event);
	return event;
}

describe("table middle-click interactions", () => {
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

	it("ignores middle-clicks on sorting headers", () => {
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
