import type { KeymapEventHandler, Menu, Scope } from "obsidian";

/** Menu internals that the public API does not expose. */
interface MenuInternals {
	scope: Scope & { keys: KeymapEventHandler[] };
}

/** Shows a menu at a mouse event and keeps its Escape from reaching the palette behind it. */
export function showMenuAtEvent(menu: Menu, event: MouseEvent): void {
	menu.showAtMouseEvent(event);
	consumeEscape(menu);
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
