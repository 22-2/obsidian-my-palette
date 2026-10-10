export type HotkeyModifier = "Ctrl" | "Alt" | "Shift" | "Meta";
export interface PaletteHotkey {
	key: string;
	modifiers: HotkeyModifier[];
}

export const HOTKEY_ACTIONS = {
	hidePreview: {
		name: "Temporarily hide palette",
		description: "Hold to fade out any palette or selector. Release either key to restore it.",
	},
	preview: {
		name: "Preview selected result",
		description:
			"Preview in a modal without closing it. Plain Right Arrow requires the cursor at the end of the input.",
	},
	history: {
		name: "Search history",
		description: "Open saved searches in any palette or selector.",
	},
	focusInput: {
		name: "Return to input mode",
		description: "Return from selection mode to typing in tag and MOC selectors.",
	},
	toggleSelection: {
		name: "Toggle selection",
		description:
			"Check or toggle the active row in selection mode. Hold Shift to extend a range where supported.",
	},
} as const;

export type HotkeyAction = keyof typeof HOTKEY_ACTIONS;
export type PaletteHotkeys = Record<HotkeyAction, PaletteHotkey | null>;

export const DEFAULT_HOTKEYS: PaletteHotkeys = {
	hidePreview: { key: "H", modifiers: ["Alt"] },
	preview: { key: "ArrowRight", modifiers: [] },
	history: { key: "R", modifiers: ["Ctrl"] },
	focusInput: { key: "F", modifiers: [] },
	toggleSelection: { key: "Space", modifiers: [] },
};

const MODIFIERS: HotkeyModifier[] = ["Ctrl", "Alt", "Shift", "Meta"];

function normalizeKey(key: string): string | undefined {
	if (key === " " || key === "Space") return "Space";
	if (key.length === 1 && !/\s/.test(key)) return key.toUpperCase();
	if (/^F([1-9]|1\d|2[0-4])$/.test(key) || key === "ArrowRight") return key;
	return undefined;
}

export function hotkeyFromEvent(event: KeyboardEvent): PaletteHotkey | undefined {
	if (event.isComposing) return undefined;
	const key = normalizeKey(event.key);
	if (!key) return undefined;
	return {
		key,
		modifiers: MODIFIERS.filter((modifier) => {
			switch (modifier) {
				case "Ctrl":
					return event.ctrlKey;
				case "Alt":
					return event.altKey;
				case "Shift":
					return event.shiftKey;
				case "Meta":
					return event.metaKey;
			}
		}),
	};
}

export function formatHotkey(hotkey: PaletteHotkey | null): string {
	if (!hotkey) return "Disabled";
	const key = hotkey.key === "ArrowRight" ? "→" : hotkey.key;
	return [...hotkey.modifiers, key].join("+");
}

export function matchesHotkey(
	event: KeyboardEvent,
	hotkey: PaletteHotkey | null,
	allowRangeShift = false,
): boolean {
	const pressed = hotkeyFromEvent(event);
	if (!hotkey || !pressed || pressed.key !== hotkey.key) return false;
	const modifiers =
		allowRangeShift && !hotkey.modifiers.includes("Shift")
			? pressed.modifiers.filter((modifier) => modifier !== "Shift")
			: pressed.modifiers;
	return modifiers.join("+") === hotkey.modifiers.join("+");
}

export function hotkeyError(
	action: HotkeyAction,
	hotkey: PaletteHotkey | null,
	settings: PaletteHotkeys,
): string | undefined {
	if (!hotkey) return undefined;
	const error = bindingError(action, hotkey);
	if (error) return error;
	for (const other of Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]) {
		const assigned = settings[other];
		if (other === action || !assigned || assigned.key !== hotkey.key) continue;
		// Shift is also a range extension for the selection shortcut.
		const range = action === "toggleSelection" || other === "toggleSelection";
		const modifiers = (binding: PaletteHotkey) =>
			binding.modifiers.filter((modifier) => !range || modifier !== "Shift").join("+");
		if (modifiers(assigned) === modifiers(hotkey))
			return `Already assigned to ${HOTKEY_ACTIONS[other].name}.`;
	}
	return undefined;
}

function bindingError(action: HotkeyAction, hotkey: PaletteHotkey): string | undefined {
	if (hotkey.key === "ArrowRight" && action !== "preview")
		return "Right Arrow is reserved for cursor movement and preview.";
	const needsModifier = action === "hidePreview" || action === "history" || action === "preview";
	if (
		needsModifier &&
		hotkey.key !== "ArrowRight" &&
		!/^F\d+$/.test(hotkey.key) &&
		!hotkey.modifiers.some((modifier) => modifier !== "Shift")
	)
		return "Use Ctrl, Alt or Meta with this key so typing still works.";
	return undefined;
}

export function normalizeHotkeys(value: unknown): PaletteHotkeys {
	const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
	const result = structuredClone(DEFAULT_HOTKEYS);
	for (const action of Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]) {
		const raw = source[action];
		if (raw === null) {
			result[action] = null;
			continue;
		}
		if (!raw || typeof raw !== "object") continue;
		const binding = raw as Record<string, unknown>;
		const key = typeof binding.key === "string" ? normalizeKey(binding.key) : undefined;
		if (
			!key ||
			!Array.isArray(binding.modifiers) ||
			!binding.modifiers.every((modifier) => MODIFIERS.includes(modifier))
		)
			continue;
		const modifiers = binding.modifiers;
		const candidate = {
			key,
			modifiers: MODIFIERS.filter((modifier) => modifiers.includes(modifier)),
		};
		if (!bindingError(action, candidate)) result[action] = candidate;
	}
	// Conflicting persisted bindings cannot be dispatched unambiguously.
	if (
		(Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).some((action) =>
			hotkeyError(action, result[action], result),
		)
	)
		return structuredClone(DEFAULT_HOTKEYS);
	return result;
}
