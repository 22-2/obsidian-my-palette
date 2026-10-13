export type HotkeyModifier = "Ctrl" | "Alt" | "Shift" | "Meta";
export interface PaletteHotkey {
	key: string;
	modifiers: HotkeyModifier[];
}

/**
 * A place where a shortcut can be pressed. A place inside another one (file search inside
 * the palette, a MOC insert selector inside selectors) overlaps it, so the two cannot share a key.
 */
export type HotkeyScope =
	| "palette"
	| "file-search"
	| "selector"
	| "tag-insert-selector"
	| "moc-insert-selector"
	| "moc-remove-selector";

const SCOPE_PARENT: Partial<Record<HotkeyScope, HotkeyScope>> = {
	"file-search": "palette",
	"tag-insert-selector": "selector",
	"moc-insert-selector": "selector",
	"moc-remove-selector": "selector",
};

export const HOTKEY_ACTIONS = {
	hidePreview: {
		name: "Hide palette or selector",
		description: "Hold to fade out any palette or selector. Release either key to restore it.",
		scopes: ["palette", "selector"],
	},
	preview: {
		name: "Preview selected result",
		description:
			"Preview in a modal without closing it. Plain Right Arrow requires the cursor at the end of the input.",
		scopes: ["palette", "tag-insert-selector", "moc-insert-selector", "moc-remove-selector"],
	},
	history: {
		name: "Search history",
		description: "Open saved searches in any palette or selector.",
		scopes: ["palette", "selector"],
	},
	contextMenu: {
		name: "Show result actions",
		description: "Open the right-click menu for the active result from the keyboard.",
		scopes: ["palette", "selector"],
	},
	enterMode: {
		name: "Enter mode",
		description: "Enter the highlighted mode from Home.",
		scopes: ["palette"],
	},
	toggleIgnored: {
		name: "Toggle Obsidian-excluded files",
		description:
			"Include files hidden by Obsidian's Excluded files setting in File search and the MOC insert selector.",
		scopes: ["file-search", "moc-insert-selector"],
	},
	toggleMutual: {
		name: "Toggle Mutual",
		description:
			"Also update the note's link to the MOC when linking or unlinking in MOC insert and remove selectors.",
		scopes: ["moc-insert-selector", "moc-remove-selector"],
	},
	focusInput: {
		name: "Return to input mode",
		description:
			"Return from selection mode to typing in tag insert, MOC insert and MOC remove selectors.",
		scopes: ["tag-insert-selector", "moc-insert-selector", "moc-remove-selector"],
	},
	toggleSelection: {
		name: "Toggle selection",
		description:
			"Check or toggle the active row in selection mode. Hold Shift to extend a range where supported.",
		scopes: ["tag-insert-selector", "moc-insert-selector", "moc-remove-selector"],
	},
} as const;

export type HotkeyAction = keyof typeof HOTKEY_ACTIONS;

/** Two scopes overlap when one is the other or sits inside it. */
export function scopesOverlap(a: readonly HotkeyScope[], b: readonly HotkeyScope[]): boolean {
	return a.some((first) =>
		b.some((second) => scopeWithin(first, second) || scopeWithin(second, first)),
	);
}

/** Whether `scope` is `outer` or sits inside it. */
function scopeWithin(scope: HotkeyScope, outer: HotkeyScope): boolean {
	for (let current: HotkeyScope | undefined = scope; current; current = SCOPE_PARENT[current]) {
		if (current === outer) return true;
	}
	return false;
}
export type PaletteHotkeys = Record<HotkeyAction, PaletteHotkey | null>;

export const DEFAULT_HOTKEYS: PaletteHotkeys = {
	hidePreview: { key: "H", modifiers: ["Alt"] },
	preview: { key: "ArrowRight", modifiers: [] },
	history: { key: "R", modifiers: ["Ctrl"] },
	contextMenu: { key: "K", modifiers: ["Ctrl"] },
	enterMode: { key: "Tab", modifiers: [] },
	toggleIgnored: { key: "I", modifiers: ["Ctrl"] },
	toggleMutual: { key: "M", modifiers: ["Ctrl"] },
	focusInput: { key: "F", modifiers: [] },
	toggleSelection: { key: "Space", modifiers: [] },
};

const MODIFIERS: HotkeyModifier[] = ["Ctrl", "Alt", "Shift", "Meta"];

function normalizeKey(key: string): string | undefined {
	if (key === " " || key === "Space") return "Space";
	if (key === "Tab") return "Tab";
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
		if (!scopesOverlap(HOTKEY_ACTIONS[action].scopes, HOTKEY_ACTIONS[other].scopes)) continue;
		// Shift is also a range extension for the selection shortcut.
		const range = action === "toggleSelection" || other === "toggleSelection";
		const modifiers = (binding: PaletteHotkey) =>
			binding.modifiers.filter((modifier) => !range || modifier !== "Shift").join("+");
		if (modifiers(assigned) === modifiers(hotkey))
			return `Already assigned to ${HOTKEY_ACTIONS[other].name}.`;
	}
	return undefined;
}

/** Actions whose key would otherwise type text in the palette input. */
const MODIFIER_ACTIONS: readonly HotkeyAction[] = [
	"hidePreview",
	"history",
	"preview",
	"contextMenu",
	"enterMode",
	"toggleIgnored",
	"toggleMutual",
];

function bindingError(action: HotkeyAction, hotkey: PaletteHotkey): string | undefined {
	if (hotkey.key === "ArrowRight" && action !== "preview")
		return "Right Arrow is reserved for cursor movement and preview.";
	// Tab is the standard way into a mode, so it may be bound without a modifier.
	const typesNothing =
		hotkey.key === "ArrowRight" ||
		/^F\d+$/.test(hotkey.key) ||
		(action === "enterMode" && hotkey.key === "Tab");
	if (
		MODIFIER_ACTIONS.includes(action) &&
		!typesNothing &&
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
			!(binding.modifiers as unknown[]).every((modifier) =>
				(MODIFIERS as readonly unknown[]).includes(modifier),
			)
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
