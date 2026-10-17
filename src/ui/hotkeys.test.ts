import { describe, expect, it } from "vitest";
import { mergeSettings } from "src/settings/mergeSettings";
import {
	DEFAULT_HOTKEYS,
	hotkeyError,
	hotkeyFromEvent,
	matchesHotkey,
	normalizeHotkeys,
	scopesOverlap,
} from "src/ui/hotkeys";

const event = (key: string, extra: Partial<KeyboardEvent> = {}) =>
	({
		key,
		ctrlKey: false,
		altKey: false,
		shiftKey: false,
		metaKey: false,
		isComposing: false,
		...extra,
	}) as KeyboardEvent;

describe("custom hotkeys", () => {
	it("loads existing settings with independent default bindings", () => {
		const settings = mergeSettings({});
		expect(settings.hotkeys).toEqual(DEFAULT_HOTKEYS);
		settings.hotkeys.hidePreview!.modifiers.push("Ctrl");
		expect(DEFAULT_HOTKEYS.hidePreview!.modifiers).toEqual(["Alt"]);
	});
	it("retains changed and disabled bindings across persistence", () => {
		const settings = mergeSettings({
			hotkeys: {
				hidePreview: { key: "n", modifiers: ["Shift", "Alt", "Alt"] },
				preview: null,
			},
		});
		expect(settings.hotkeys.hidePreview).toEqual({ key: "N", modifiers: ["Alt", "Shift"] });
		expect(mergeSettings(JSON.parse(JSON.stringify(settings))).hotkeys).toEqual(
			settings.hotkeys,
		);
	});
	it("rejects basic navigation, malformed data and query-consuming bindings", () => {
		expect(
			normalizeHotkeys({
				hidePreview: { key: "h", modifiers: [] },
				preview: { key: "Enter", modifiers: [] },
				history: { key: "R", modifiers: ["invalid"] },
				focusInput: 1,
			}),
		).toEqual(DEFAULT_HOTKEYS);
		expect(hotkeyFromEvent(event("Enter"))).toBeUndefined();
		expect(hotkeyFromEvent(event("Alt", { altKey: true }))).toBeUndefined();
		expect(hotkeyFromEvent(event("h", { altKey: true, isComposing: true }))).toBeUndefined();
	});
	it("detects collisions including Shift range shortcuts", () => {
		expect(hotkeyError("hidePreview", DEFAULT_HOTKEYS.history, DEFAULT_HOTKEYS)).toContain(
			"検索履歴",
		);
		expect(
			hotkeyError("focusInput", { key: "Space", modifiers: ["Shift"] }, DEFAULT_HOTKEYS),
		).toContain("選択を切り替え");
		expect(hotkeyError("hidePreview", null, DEFAULT_HOTKEYS)).toBeUndefined();
		expect(normalizeHotkeys({ hidePreview: DEFAULT_HOTKEYS.history })).toEqual(DEFAULT_HOTKEYS);
	});
	it("binds Tab to enter a mode alone, and requires a modifier for the switch keys", () => {
		expect(normalizeHotkeys({ enterMode: { key: "Tab", modifiers: [] } }).enterMode).toEqual({
			key: "Tab",
			modifiers: [],
		});
		expect(
			hotkeyError("enterMode", { key: "Tab", modifiers: [] }, DEFAULT_HOTKEYS),
		).toBeUndefined();
		expect(hotkeyError("enterMode", { key: "J", modifiers: [] }, DEFAULT_HOTKEYS)).toContain(
			"Ctrl、Alt、Meta のいずれか",
		);
		expect(
			hotkeyError("optionsMenu", { key: "O", modifiers: ["Shift"] }, DEFAULT_HOTKEYS),
		).toContain("Ctrl、Alt、Meta のいずれか");
		expect(
			hotkeyError("optionsMenu", { key: "P", modifiers: ["Ctrl"] }, DEFAULT_HOTKEYS),
		).toBeUndefined();
	});

	it("treats a shared key as a collision only where both shortcuts can be used", () => {
		// The palette and the tag insert selector are separate places, so they can share a key.
		expect(scopesOverlap(["palette"], ["tag-insert-selector"])).toBe(false);
		expect(scopesOverlap(["moc-insert-selector"], ["tag-insert-selector"])).toBe(false);
		// Every selector is part of the selector group.
		expect(scopesOverlap(["selector"], ["moc-insert-selector"])).toBe(true);
		// The selectors sit inside the "all palettes and selectors" scope, so the hide shortcut clashes with them.
		expect(
			hotkeyError("toggleSelection", DEFAULT_HOTKEYS.hidePreview, DEFAULT_HOTKEYS),
		).toContain("パレットまたはセレクターを隠す");
	});

	it("matches exact modifiers and allows range Shift only for selection", () => {
		expect(matchesHotkey(event("h", { altKey: true }), DEFAULT_HOTKEYS.hidePreview)).toBe(true);
		expect(
			matchesHotkey(
				event("h", { altKey: true, shiftKey: true }),
				DEFAULT_HOTKEYS.hidePreview,
			),
		).toBe(false);
		expect(
			matchesHotkey(event(" ", { shiftKey: true }), DEFAULT_HOTKEYS.toggleSelection, true),
		).toBe(true);
		expect(matchesHotkey(event("h", { altKey: true }), null)).toBe(false);
	});
});
