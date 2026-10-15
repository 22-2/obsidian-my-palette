import { describe, expect, it, vi } from "vitest";
import { HOTKEY_ACTIONS } from "src/ui/hotkeys";
import { compareScopes, hotkeyScopeLabel } from "src/settings/shortcutsTable";

vi.mock("obsidian", () => ({ Notice: class {} }));

describe("hotkeyScopeLabel", () => {
	it("names every place a shortcut works, collapsing palette and selectors", () => {
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.hidePreview.scopes)).toBe(
			"All palettes and selectors",
		);
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.toggleIgnored.scopes)).toBe(
			"File search, MOC insert selector",
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
		expect(hotkeyScopeLabel(["moc-insert-selector", "file-search"])).toBe(
			"File search, MOC insert selector",
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
			"Toggle Obsidian-excluded files",
			"Return to input mode",
			"Toggle selection",
			"Toggle Mutual",
		]);
	});
});
