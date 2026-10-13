import { describe, expect, it, vi } from "vitest";
import { HOTKEY_ACTIONS } from "src/ui/hotkeys";
import { hotkeyScopeLabel } from "src/settings/shortcutsTable";

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
			"Tag insert selector, MOC insert selector, MOC remove selector",
		);
		expect(hotkeyScopeLabel(HOTKEY_ACTIONS.enterMode.scopes)).toBe("Palette");
	});
});
