import type { Menu as ObsidianMenu } from "obsidian";
import { describe, expect, it } from "vitest";
import { Menu } from "src/ui/testing/obsidianDom";
import { showMenuAtEvent } from "src/ui/menus";

describe("showMenuAtEvent", () => {
	it("closes only the menu on Escape and stops the key there", () => {
		const menu = new Menu();
		showMenuAtEvent(menu as unknown as ObsidianMenu, {} as MouseEvent);
		const escapes = menu.scope.keys.filter(({ key }) => key === "Escape");
		expect(escapes).toHaveLength(1);
		expect(escapes[0].func({} as KeyboardEvent)).toBe(false);
		expect(menu.closed).toBe(true);
	});
});
