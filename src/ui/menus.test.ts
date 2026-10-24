import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { markKeyboardMenuEvent, showMenuAtEvent } from "src/ui/menus";
import { PaletteMenu } from "src/ui/paletteMenu";
import { installObsidianDom } from "src/ui/testing/obsidianDom";

vi.mock("obsidian", () => import("src/ui/testing/obsidianDom"));

beforeEach(() => {
	const dom = new Window();
	for (const name of [
		"document",
		"Element",
		"HTMLElement",
		"Event",
		"KeyboardEvent",
		"MouseEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

function menuWithDisabledFirst(): PaletteMenu {
	const menu = new PaletteMenu();
	menu.addItem((item) =>
		item
			.setTitle("Actions")
			.setDisabled(true)
			.onClick(() => undefined),
	);
	menu.addItem((item) => item.setTitle("Open").onClick(() => undefined));
	return menu;
}

function selectedTitle(): string | null {
	return document.querySelector(".menu-item.selected .menu-item-title")?.textContent ?? null;
}

describe("イベント位置へのメニュー表示", () => {
	it("キーボードから開かれたメニューに対してのみ、最初に有効になった項目を選択します", () => {
		showMenuAtEvent(menuWithDisabledFirst(), new MouseEvent("contextmenu"));
		expect(selectedTitle()).toBeNull();
		document.body.replaceChildren();

		showMenuAtEvent(menuWithDisabledFirst(), markKeyboardMenuEvent(new MouseEvent("click")));
		expect(selectedTitle()).toBe("Open");
	});
});
