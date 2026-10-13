import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SuggestionPanel } from "src/ui/suggestionPanel";
import type { PaletteHotkey } from "src/ui/hotkeys";
import type { StatusToggleOptions } from "src/ui/statusToggle";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

beforeEach(() => {
	const dom = new Window();
	for (const name of ["document", "Element", "HTMLElement", "Event", "KeyboardEvent"] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

function fixture() {
	const root = document.body.appendChild(document.createElement("div"));
	const panel = new SuggestionPanel<string>(root, {
		surface: "modal",
		onInput: vi.fn(),
		renderSuggestion: vi.fn(),
		onChoose: vi.fn(),
	});
	panel.load();
	const add = (options: Partial<StatusToggleOptions> = {}) => {
		const onChange = vi.fn();
		const toggle = panel.addStatusToggle({
			id: "mutual",
			label: "Mutual",
			hotkey: () => ({ key: "M", modifiers: ["Ctrl"] }),
			description: "Also update the note",
			value: true,
			onChange,
			...options,
		});
		return { toggle, onChange };
	};
	const toggleEl = (id: string) =>
		root.querySelector<HTMLElement>(`[data-status-toggle="${id}"]`);
	const pressCtrl = (key: string) =>
		panel.inputEl.dispatchEvent(
			new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true }),
		);
	return { root, panel, add, toggleEl, pressCtrl };
}

describe("status toggle", () => {
	it("shows the footer switch and flips it by click or Ctrl+key", () => {
		const { root, add, toggleEl, pressCtrl } = fixture();
		const { toggle, onChange } = add();
		const el = toggleEl("mutual");
		expect(root.classList.contains("has-status-toggle")).toBe(true);
		expect(el?.getAttribute("role")).toBe("switch");
		expect(el?.textContent).toBe("MutualCtrl+M");
		expect(el?.getAttribute("aria-checked")).toBe("true");

		el?.click();
		expect(toggle.value).toBe(false);
		expect(onChange).toHaveBeenLastCalledWith(false);
		pressCtrl("m");
		expect(onChange).toHaveBeenLastCalledWith(true);
		expect(el?.querySelector(".checkbox-container")?.classList.contains("is-enabled")).toBe(
			true,
		);
	});

	it("drops the shortcut hint when the binding is cleared, and the click still works", () => {
		const hotkey = {
			current: { key: "M", modifiers: ["Ctrl" as const] } as PaletteHotkey | null,
		};
		const { add, toggleEl, pressCtrl } = fixture();
		add({ hotkey: () => hotkey.current });
		const el = toggleEl("mutual");
		expect(el?.textContent).toBe("MutualCtrl+M");

		hotkey.current = null;
		pressCtrl("m");
		el?.click();
		expect(el?.textContent).toBe("Mutual");
		expect(el?.getAttribute("title")).toBe("Also update the note");
		expect(el?.getAttribute("aria-checked")).toBe("false");
	});

	it("hides a switch that does not apply and ignores its shortcut until it is shown again", () => {
		const { add, toggleEl, pressCtrl } = fixture();
		const { toggle, onChange } = add({
			id: "include-ignored",
			hotkey: () => ({ key: "I", modifiers: ["Ctrl"] }),
			value: true,
		});
		toggle.setHidden(true);
		const el = toggleEl("include-ignored");
		expect(el?.hasAttribute("hidden")).toBe(true);
		pressCtrl("i");
		expect(onChange).not.toHaveBeenCalled();
		expect(toggle.value).toBe(true);

		toggle.setHidden(false);
		expect(el?.hasAttribute("hidden")).toBe(false);
		pressCtrl("i");
		expect(onChange).toHaveBeenCalledWith(false);
	});

	it("orders switches as added and replaces one with the same id in place", () => {
		const { root, add } = fixture();
		add({
			id: "include-ignored",
			label: "Ignored",
			hotkey: () => ({ key: "I", modifiers: ["Ctrl"] }),
		});
		add();
		add({
			id: "include-ignored",
			label: "Ignored",
			hotkey: () => ({ key: "I", modifiers: ["Ctrl"] }),
		});
		const ids = [...root.querySelectorAll(".my-palette-status-toggle")].map((el) =>
			el.getAttribute("data-status-toggle"),
		);
		expect(ids).toEqual(["include-ignored", "mutual"]);
		expect(root.querySelector(".my-palette-status-bar")?.lastElementChild?.className).toBe(
			"my-palette-status-bar__count",
		);
	});
});
