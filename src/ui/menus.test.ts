import type { Menu as ObsidianMenu } from "obsidian";
import { describe, expect, it } from "vitest";
import { Menu } from "src/ui/testing/obsidianDom";
import { markKeyboardMenuEvent, showMenuAtEvent } from "src/ui/menus";

describe("showMenuAtEvent", () => {
	it("closes only the menu on Escape and stops the key there", () => {
		const menu = new Menu();
		showMenuAtEvent(menu as unknown as ObsidianMenu, {} as MouseEvent);
		const escapes = menu.scope.keys.filter(({ key }) => key === "Escape");
		expect(escapes).toHaveLength(1);
		expect(escapes[0].func({} as KeyboardEvent)).toBe(false);
		expect(menu.closed).toBe(true);
	});
	it("selects the first enabled item only for keyboard menus", () => {
		const entries = () => [
			{ title: "Actions", disabled: true, click: () => undefined },
			{ title: "Open", click: () => undefined },
		];
		const pointerMenu = new Menu();
		pointerMenu.items.push(...entries());
		showMenuAtEvent(pointerMenu as unknown as ObsidianMenu, {} as MouseEvent);
		expect(pointerMenu.selected).toBe(-1);

		const keyboardMenu = new Menu();
		keyboardMenu.items.push(...entries());
		showMenuAtEvent(
			keyboardMenu as unknown as ObsidianMenu,
			markKeyboardMenuEvent({} as MouseEvent),
		);
		expect(keyboardMenu.selected).toBe(1);
	});
});
