import type { KeymapEventHandler, Menu, Scope } from "obsidian";

/** Menu internals that the public API does not expose. */
interface MenuInternals {
	scope: Scope & { keys: KeymapEventHandler[] };
	onArrowDown(event: Pick<KeyboardEvent, "preventDefault">): void;
}

const keyboardMenuEvents = new WeakSet<MouseEvent>();

/** Marks a synthetic event for a menu requested from the keyboard. */
export function markKeyboardMenuEvent(event: MouseEvent): MouseEvent {
	keyboardMenuEvents.add(event);
	return event;
}

/** Shows a menu at a mouse event and keeps its Escape from reaching the palette behind it. */
export function showMenuAtEvent(menu: Menu, event: MouseEvent): void {
	menu.showAtMouseEvent(event);
	consumeEscape(menu);
	// Why: a menu opened from the keyboard starts on its first action, so Enter
	// works at once. Pointer menus keep Obsidian's unselected start.
	if (keyboardMenuEvents.has(event)) selectFirstItem(menu);
}

function selectFirstItem(menu: Menu): void {
	// Why: moving down from no selection reuses Obsidian's own rule for skipping
	// disabled headings and separators.
	(menu as unknown as MenuInternals).onArrowDown({ preventDefault: () => undefined });
}

function consumeEscape(menu: Menu): void {
	const { scope } = menu as unknown as MenuInternals;
	// Why: Obsidian's menu hides on Escape without consuming the key, so the
	// palette input then sees the same Escape and closes or clears the palette.
	// Returning false makes the keymap stop the event, as the arrow keys already do.
	for (const handler of scope.keys.filter(
		(handler) => handler.key === "Escape" && handler.modifiers === "",
	))
		scope.unregister(handler);
	scope.register([], "Escape", () => {
		menu.hide();
		return false;
	});
}
