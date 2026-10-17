import { t } from "src/i18n";

export type HotkeyModifier = "Ctrl" | "Alt" | "Shift" | "Meta";
export interface PaletteHotkey {
	key: string;
	modifiers: HotkeyModifier[];
}

/**
 * ショートカットを押せる場所。別の場所の内側にある場所(セレクターの中の MOC 挿入セレクター)は
 * それと重なるので、2つは同じキーを共有できない。ファイル検索などのパレットのモードは、すべて
 * 「palette」に含まれるので、パレットのショートカットはどのモードでも動く。
 */
export type HotkeyScope =
	| "palette"
	| "selector"
	| "tag-insert-selector"
	| "moc-insert-selector"
	| "moc-remove-selector"
	| "property-value-selector";

const SCOPE_PARENT: Partial<Record<HotkeyScope, HotkeyScope>> = {
	"tag-insert-selector": "selector",
	"moc-insert-selector": "selector",
	"moc-remove-selector": "selector",
	"property-value-selector": "selector",
};

export const HOTKEY_ACTIONS = {
	hidePreview: {
		name: t("hotkey.hidePreview.name"),
		description: t("hotkey.hidePreview.description"),
		scopes: ["palette", "selector"],
	},
	preview: {
		name: t("hotkey.preview.name"),
		description: t("hotkey.preview.description"),
		// MOC 削除セレクターはリンク済みのノートだけを並べ、プレビューはない。
		scopes: ["palette", "tag-insert-selector", "moc-insert-selector"],
	},
	history: {
		name: t("hotkey.history.name"),
		description: t("hotkey.history.description"),
		scopes: ["palette", "selector"],
	},
	optionsMenu: {
		name: t("hotkey.optionsMenu.name"),
		description: t("hotkey.optionsMenu.description"),
		scopes: ["palette", "selector"],
	},
	contextMenu: {
		name: t("hotkey.contextMenu.name"),
		description: t("hotkey.contextMenu.description"),
		scopes: ["palette", "selector"],
	},
	enterMode: {
		name: t("hotkey.enterMode.name"),
		description: t("hotkey.enterMode.description"),
		scopes: ["palette"],
	},
	focusInput: {
		name: t("hotkey.focusInput.name"),
		description: t("hotkey.focusInput.description"),
		scopes: [
			"tag-insert-selector",
			"moc-insert-selector",
			"moc-remove-selector",
			"property-value-selector",
		],
	},
	toggleSelection: {
		name: t("hotkey.toggleSelection.name"),
		description: t("hotkey.toggleSelection.description"),
		scopes: [
			"tag-insert-selector",
			"moc-insert-selector",
			"moc-remove-selector",
			"property-value-selector",
		],
	},
} as const;

export type HotkeyAction = keyof typeof HOTKEY_ACTIONS;

/** 2つの場所は、一方が他方であるか、他方の内側にあるとき重なる。 */
export function scopesOverlap(a: readonly HotkeyScope[], b: readonly HotkeyScope[]): boolean {
	return a.some((first) =>
		b.some((second) => scopeWithin(first, second) || scopeWithin(second, first)),
	);
}

/** これらの場所を持つショートカットが、`place` で押せるかどうか。 */
export function worksIn(scopes: readonly HotkeyScope[], place: HotkeyScope): boolean {
	return scopes.some((scope) => scopeWithin(place, scope));
}

/** `scope` が `outer` であるか、その内側にあるかどうか。 */
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
	optionsMenu: { key: "O", modifiers: ["Ctrl"] },
	contextMenu: { key: "K", modifiers: ["Ctrl"] },
	enterMode: { key: "Tab", modifiers: [] },
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
	if (!hotkey) return t("hotkey.disabled");
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
		// Shift は選択のショートカットでは範囲を広げる修飾キーにもなる。
		const range = action === "toggleSelection" || other === "toggleSelection";
		const modifiers = (binding: PaletteHotkey) =>
			binding.modifiers.filter((modifier) => !range || modifier !== "Shift").join("+");
		if (modifiers(assigned) === modifiers(hotkey))
			return t("hotkey.error.assigned", { name: HOTKEY_ACTIONS[other].name });
	}
	return undefined;
}

/** キーを押すと、そのままパレットの入力に文字が入ってしまう操作。 */
const MODIFIER_ACTIONS: readonly HotkeyAction[] = [
	"hidePreview",
	"history",
	"optionsMenu",
	"preview",
	"contextMenu",
	"enterMode",
];

function bindingError(action: HotkeyAction, hotkey: PaletteHotkey): string | undefined {
	if (hotkey.key === "ArrowRight" && action !== "preview") return t("hotkey.error.rightArrow");
	// Tab はモードに入る標準の方法なので、修飾キーなしで割り当ててよい。
	const typesNothing =
		hotkey.key === "ArrowRight" ||
		/^F\d+$/.test(hotkey.key) ||
		(action === "enterMode" && hotkey.key === "Tab");
	if (
		MODIFIER_ACTIONS.includes(action) &&
		!typesNothing &&
		!hotkey.modifiers.some((modifier) => modifier !== "Shift")
	)
		return t("hotkey.error.modifierNeeded");
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
	// 衝突している保存済みの割り当ては、一意に振り分けられないので、既定に戻す。
	if (
		(Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).some((action) =>
			hotkeyError(action, result[action], result),
		)
	)
		return structuredClone(DEFAULT_HOTKEYS);
	return result;
}
