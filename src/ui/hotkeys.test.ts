import { describe, expect, it } from "vitest";
import { mergeSettings } from "src/settings/mergeSettings";
import {
	DEFAULT_HOTKEYS,
	hotkeyError,
	hotkeyFromEvent,
	matchesHotkey,
	normalizeHotkeys,
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
			"Search history",
		);
		expect(
			hotkeyError("focusInput", { key: "Space", modifiers: ["Shift"] }, DEFAULT_HOTKEYS),
		).toContain("Toggle selection");
		expect(hotkeyError("hidePreview", null, DEFAULT_HOTKEYS)).toBeUndefined();
		expect(normalizeHotkeys({ hidePreview: DEFAULT_HOTKEYS.history })).toEqual(DEFAULT_HOTKEYS);
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
