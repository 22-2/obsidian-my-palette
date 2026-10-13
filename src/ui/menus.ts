import type { PaletteMenu } from "src/ui/paletteMenu";

const keyboardMenuEvents = new WeakSet<MouseEvent>();

/** Marks a synthetic event for a menu requested from the keyboard. */
export function markKeyboardMenuEvent(event: MouseEvent): MouseEvent {
	keyboardMenuEvents.add(event);
	return event;
}

/** Shows a menu at a mouse event. A menu opened from the keyboard starts on its first action, so Enter works at once. */
export function showMenuAtEvent(menu: PaletteMenu, event: MouseEvent): void {
	// Why: pointer menus keep the unselected start, so only keyboard-opened menus select their first action.
	menu.showAtMouseEvent(event, { selectFirst: keyboardMenuEvents.has(event) });
}
