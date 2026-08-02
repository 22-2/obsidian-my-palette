import { ACTION_IDS, type ActionId } from "src/model/settings";

const MODIFIER_ORDER = ["Ctrl", "Shift", "Alt", "Meta"] as const;

export function normalizeKeybinding(binding: string): string {
	const parts = binding
		.split("+")
		.map((part) => part.trim())
		.filter(Boolean);
	const key =
		parts.find(
			(part) =>
				!MODIFIER_ORDER.some((modifier) => modifier.toLowerCase() === part.toLowerCase()),
		) ?? "";
	const modifiers = MODIFIER_ORDER.filter((modifier) =>
		parts.some((part) => part.toLowerCase() === modifier.toLowerCase()),
	);
	return [...modifiers, key.length === 1 ? key.toUpperCase() : key].filter(Boolean).join("+");
}

export function eventKeybinding(event: KeyboardEvent): string {
	return [
		event.ctrlKey && "Ctrl",
		event.shiftKey && "Shift",
		event.altKey && "Alt",
		event.metaKey && "Meta",
		event.key.length === 1 ? event.key.toUpperCase() : event.key,
	]
		.filter((value): value is string => Boolean(value))
		.join("+");
}

export function findAction(
	event: KeyboardEvent,
	bindings: Record<string, string[]>,
): ActionId | null {
	if (event.isComposing || event.keyCode === 229) return null;
	if (event.key === "Escape") return "close";
	const pressed = eventKeybinding(event);
	return (
		ACTION_IDS.find((action) =>
			bindings[action]?.some((binding) => normalizeKeybinding(binding) === pressed),
		) ?? null
	);
}

export function validateKeybindings(bindings: Record<string, string[]>): string | null {
	const owner = new Map<string, string>();
	for (const action of ACTION_IDS) {
		const values = bindings[action] ?? [];
		if (values.length > 2) return `${action} can have at most two keybindings.`;
		for (const raw of values) {
			const binding = normalizeKeybinding(raw);
			if (!binding) continue;
			if (/^[A-Z0-9\p{P}\p{S}]$/u.test(binding))
				return `${binding} would interfere with typing.`;
			const conflict = owner.get(binding);
			if (conflict && conflict !== action) return `${binding} conflicts with ${conflict}.`;
			owner.set(binding, action);
		}
	}
	if (!(bindings.close ?? []).some((binding) => normalizeKeybinding(binding) === "Escape"))
		return "Escape cannot be removed.";
	return null;
}
