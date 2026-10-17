import type { Setting } from "obsidian";
import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, type HotkeyAction } from "src/ui/hotkeys";
import { DEFAULT_SETTINGS } from "src/settings/model";
import type { SettingsHost } from "src/settings/settingsHost";
import { compareScopes, hotkeyScopeLabel, renderShortcutsTable } from "src/settings/shortcutsTable";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

const notices = vi.hoisted(() => [] as string[]);
vi.mock("obsidian", () => ({
	Notice: class {
		constructor(message: string) {
			notices.push(message);
		}
	},
}));

describe("hotkeyScopeLabel", () => {
	it("names every place a shortcut works, collapsing palette and selectors", () => {
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.hidePreview.scopes)).toBe(
			"All palettes and selectors",
		);
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.preview.scopes)).toBe(
			"Palette, Tag insert selector, MOC insert selector",
		);
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.focusInput.scopes)).toBe(
			"Tag insert selector, MOC insert selector, MOC remove selector, Property value selector",
		);
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.enterMode.scopes)).toBe("Palette");
	});

	it("lists places in one order, from the palette to the selectors", () => {
		expect(hotkeyScopeLabel(["moc-remove-selector", "tag-insert-selector"])).toBe(
			"Tag insert selector, MOC remove selector",
		);
		expect(hotkeyScopeLabel(["moc-insert-selector", "palette"])).toBe(
			"Palette, MOC insert selector",
		);
	});
});

describe("compareScopes", () => {
	it("sorts the shortcuts by When, everywhere first", () => {
		const names = Object.values(HOTKEY_ACTIONS)
			.sort((a, b) => compareScopes(a.scopes, b.scopes))
			.map(({ name }) => name);
		expect(names).toEqual([
			"Hide palette or selector",
			"Search history",
			"Show options menu",
			"Show result actions",
			"Enter mode",
			"Preview selected result",
			"Return to input mode",
			"Toggle selection",
		]);
	});
});

describe("renderShortcutsTable", () => {
	beforeEach(() => {
		const dom = new Window();
		for (const name of [
			"document",
			"Element",
			"HTMLElement",
			"Event",
			"KeyboardEvent",
		] as const)
			vi.stubGlobal(name, dom[name]);
		vi.stubGlobal("window", dom);
		installObsidianDom();
		notices.length = 0;
	});
	afterEach(() => {
		document.body.replaceChildren();
		vi.unstubAllGlobals();
	});

	function render() {
		const settings = structuredClone(DEFAULT_SETTINGS);
		const saveSettings = vi.fn().mockResolvedValue(undefined);
		const plugin = { settings, saveSettings } as unknown as SettingsHost;
		const settingEl = document.body.appendChild(createDiv());
		const controlEl = settingEl.appendChild(createDiv());
		renderShortcutsTable({ settingEl, controlEl } as unknown as Setting, plugin);
		const keyOf = (action: HotkeyAction) =>
			controlEl.querySelector<HTMLElement>(`#my-palette-shortcut-${action}-key`)!;
		const rowOf = (action: HotkeyAction) => keyOf(action).closest("tr")!;
		const errorOf = (action: HotkeyAction) => rowOf(action).nextElementSibling as HTMLElement;
		const resetOf = (action: HotkeyAction) =>
			rowOf(action).querySelector<HTMLButtonElement>(".my-palette-shortcuts__reset")!;
		const filter = controlEl.querySelector<HTMLInputElement>(".my-palette-shortcuts__filter")!;
		const placeFilter = controlEl.querySelector<HTMLSelectElement>(
			".my-palette-shortcuts__place-filter",
		)!;
		const groups = () => [
			...controlEl.querySelectorAll<HTMLElement>(".my-palette-shortcuts__group"),
		];
		return {
			settings,
			saveSettings,
			keyOf,
			rowOf,
			errorOf,
			resetOf,
			filter,
			placeFilter,
			groups,
		};
	}

	function visibleActions(t: ReturnType<typeof render>): HotkeyAction[] {
		return (Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).filter(
			(action) => !t.rowOf(action).hidden,
		);
	}

	function press(el: HTMLElement, key: string, options: KeyboardEventInit = {}) {
		el.dispatchEvent(
			new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...options }),
		);
	}

	async function settle(): Promise<void> {
		for (let i = 0; i < 3; i += 1) await Promise.resolve();
	}

	it("records a new shortcut and then offers Reset back to the default", async () => {
		const t = render();
		const key = t.keyOf("optionsMenu");
		expect(t.resetOf("optionsMenu").hidden).toBe(true);
		key.click();
		expect(key.textContent).toBe("Press a shortcut…");
		press(key, "o", { ctrlKey: true, shiftKey: true });
		await settle();
		expect(t.settings.hotkeys.optionsMenu).toEqual({ key: "O", modifiers: ["Ctrl", "Shift"] });
		expect(t.saveSettings).toHaveBeenCalledTimes(1);
		expect(key.textContent).toBe("Ctrl+Shift+O");
		expect(t.resetOf("optionsMenu").hidden).toBe(false);

		t.resetOf("optionsMenu").click();
		await settle();
		expect(t.settings.hotkeys.optionsMenu).toEqual(DEFAULT_HOTKEYS.optionsMenu);
		expect(key.textContent).toBe("Ctrl+O");
	});

	it("refuses a shortcut another action already uses in the same place", async () => {
		const t = render();
		const key = t.keyOf("history");
		key.click();
		press(key, "k", { ctrlKey: true });
		await settle();
		expect(t.errorOf("history").textContent).toBe(
			`Already assigned to ${HOTKEY_ACTIONS.contextMenu.name}.`,
		);
		expect(t.errorOf("history").hidden).toBe(false);
		expect(t.settings.hotkeys.history).toEqual(DEFAULT_HOTKEYS.history);
		expect(t.saveSettings).not.toHaveBeenCalled();
	});

	it("cancels with Escape and disables with Backspace", async () => {
		const t = render();
		const key = t.keyOf("preview");
		key.click();
		press(key, "Escape");
		expect(key.textContent).toBe("→");
		expect(t.saveSettings).not.toHaveBeenCalled();

		press(key, "Enter");
		press(key, "Backspace");
		await settle();
		expect(t.settings.hotkeys.preview).toBeNull();
		expect(key.textContent).toBe("Disabled");
	});

	it("restores the previous shortcut and tells the user when saving fails", async () => {
		const t = render();
		t.saveSettings.mockRejectedValueOnce(new Error("disk full"));
		const key = t.keyOf("optionsMenu");
		key.click();
		press(key, "p", { ctrlKey: true, altKey: true });
		await settle();
		expect(t.settings.hotkeys.optionsMenu).toEqual(DEFAULT_HOTKEYS.optionsMenu);
		expect(notices).toEqual(["Could not save hotkey: disk full"]);
		expect(key.textContent).toBe("Press a shortcut…");
	});

	it("filters rows by command, keybinding or place", () => {
		const t = render();
		t.filter.value = "ctrl+k";
		t.filter.dispatchEvent(new Event("input"));
		expect(visibleActions(t)).toEqual(["contextMenu"]);
		t.filter.value = "palette enter";
		t.filter.dispatchEvent(new Event("input"));
		expect(visibleActions(t)).toEqual(["enterMode"]);
		t.filter.value = "";
		t.filter.dispatchEvent(new Event("input"));
		expect(visibleActions(t)).toHaveLength(Object.keys(HOTKEY_ACTIONS).length);
	});

	it("lists each shortcut once, under a heading for the places it works in", () => {
		const t = render();
		const headings = t.groups().map((group) => ({
			name: group.querySelector("th")!.getAttribute("aria-label"),
			chips: [...group.querySelectorAll(".my-palette-shortcuts__place")].map(
				(chip) => chip.textContent,
			),
			rows: group.querySelectorAll(".my-palette-shortcuts__row").length,
		}));
		expect(headings).toEqual([
			{
				name: "All palettes and selectors",
				chips: ["All palettes and selectors"],
				rows: 4,
			},
			{ name: "Palette", chips: ["Palette"], rows: 1 },
			{
				name: "Palette, Tag insert selector, MOC insert selector",
				chips: ["Palette", "Tag", "MOC +"],
				rows: 1,
			},
			{
				name: "Tag insert selector, MOC insert selector, MOC remove selector, Property value selector",
				chips: ["Tag", "MOC +", "MOC −", "Property"],
				rows: 2,
			},
		]);
	});

	it("narrows to one place, keeping shortcuts that work everywhere", () => {
		const t = render();
		t.placeFilter.value = "moc-remove-selector";
		t.placeFilter.dispatchEvent(new Event("change"));
		expect(visibleActions(t)).toEqual([
			"hidePreview",
			"history",
			"optionsMenu",
			"contextMenu",
			"focusInput",
			"toggleSelection",
		]);
		// Groups left with no rows hide their heading, and the chosen place is marked.
		expect(t.groups().map((group) => group.hidden)).toEqual([false, true, true, false]);
		expect(
			[...t.groups()[3].querySelectorAll(".my-palette-shortcuts__place.is-match")].map(
				(chip) => chip.textContent,
			),
		).toEqual(["MOC −"]);

		// The text filter applies within the chosen place.
		t.filter.value = "space";
		t.filter.dispatchEvent(new Event("input"));
		expect(visibleActions(t)).toEqual(["toggleSelection"]);
		expect(t.groups()[0].hidden).toBe(true);
	});
});
