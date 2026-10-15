import { Window } from "happy-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import { PaletteMenu, placeMenu, type PaletteMenuItem } from "src/ui/paletteMenu";
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
		"PointerEvent",
	] as const)
		vi.stubGlobal(name, dom[name]);
	vi.stubGlobal("window", dom);
	installObsidianDom();
});
afterEach(() => {
	document.body.replaceChildren();
	vi.unstubAllGlobals();
});

function sample() {
	const menu = new PaletteMenu();
	const run = vi.fn();
	menu.addItem((item) => item.setTitle("Open").setIcon("file").onClick(run));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle("Disabled").setDisabled(true).onClick(vi.fn()));
	menu.addItem((item) => item.setTitle("Help").onClick(vi.fn()));
	return { menu, run };
}

function titleOf(element: Element | null): string | null {
	return element?.querySelector(".menu-item-title")?.textContent ?? null;
}

function itemNamed(title: string): HTMLElement {
	const item = [...document.querySelectorAll<HTMLElement>(".menu-item")].find(
		(element) => titleOf(element) === title,
	);
	if (!item) throw new Error(`no menu item: ${title}`);
	return item;
}

function titleOfItem(item: PaletteMenuItem): string {
	return titleOf(item.dom) ?? "";
}

function selectedTitle(): string | null {
	return titleOf(document.querySelector(".menu-item.selected"));
}

function press(key: string, target: EventTarget = document.body): KeyboardEvent {
	const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
	target.dispatchEvent(event);
	return event;
}

describe("PaletteMenu markup", () => {
	it("uses Obsidian's menu classes and separates groups", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 10, y: 20 });

		expect(document.querySelectorAll(".menu > .menu-scroll > .menu-group")).toHaveLength(2);
		expect(document.querySelectorAll(".menu > .menu-scroll > .menu-separator")).toHaveLength(1);
		expect(itemNamed("Open").querySelector(".menu-item-icon")).not.toBeNull();
		expect(itemNamed("Disabled").classList.contains("is-disabled")).toBe(true);
	});

	it("drops a separator that has no item before it", () => {
		const menu = new PaletteMenu();
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Only"));
		menu.addSeparator();
		menu.addSeparator();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(document.querySelectorAll(".menu-separator")).toHaveLength(1);
	});

	it("shows the checked and warning states on the item", () => {
		const menu = new PaletteMenu();
		menu.addItem((item) => item.setTitle("On").setChecked(true));
		menu.addItem((item) => item.setTitle("Remove").setWarning(true));
		menu.showAtPosition({ x: 0, y: 0 });

		expect(itemNamed("On").classList.contains("mod-checked")).toBe(true);
		expect(itemNamed("On").querySelector(".mod-checked")).not.toBeNull();
		expect(itemNamed("Remove").classList.contains("is-warning")).toBe(true);
	});

	it("draws a switch in both states and keeps headings out of keyboard selection", () => {
		const menu = new PaletteMenu();
		menu.addHeading("Options");
		menu.addItem((item) => item.setTitle("Off").setSwitch(false));
		menu.addItem((item) => item.setTitle("On").setSwitch(true).setTooltip("Explains it"));
		menu.showAtPosition({ x: 0, y: 0 }, { selectFirst: true });

		expect(document.querySelector(".my-palette-menu-heading")?.textContent).toBe("Options");
		expect(document.querySelector(".menu-item.selected")).toBe(itemNamed("Off"));
		expect(itemNamed("Off").querySelector(".my-palette-menu-switch")).not.toBeNull();
		expect(itemNamed("Off").querySelector(".is-enabled")).toBeNull();
		expect(itemNamed("Off").getAttribute("aria-checked")).toBe("false");
		expect(itemNamed("On").querySelector(".my-palette-menu-switch.is-enabled")).not.toBeNull();
		expect(itemNamed("On").getAttribute("role")).toBe("menuitemcheckbox");
		expect(itemNamed("On").getAttribute("title")).toBe("Explains it");
	});

	it("exposes menu roles and the checked and disabled states to assistive tech", () => {
		const menu = new PaletteMenu();
		menu.addItem((item) => item.setTitle("Plain"));
		menu.addItem((item) => item.setTitle("Checked").setChecked(false).setDisabled(true));
		menu.addSeparator();
		menu.addItem((item) => item.setTitle("Last"));
		menu.showAtPosition({ x: 0, y: 0 });

		expect(document.querySelector(".menu")?.getAttribute("role")).toBe("menu");
		expect(itemNamed("Plain").getAttribute("role")).toBe("menuitem");
		expect(itemNamed("Checked").getAttribute("role")).toBe("menuitemcheckbox");
		expect(itemNamed("Checked").getAttribute("aria-checked")).toBe("false");
		expect(itemNamed("Checked").getAttribute("aria-disabled")).toBe("true");
		expect(document.querySelector(".menu-separator")?.getAttribute("role")).toBe("separator");
	});

	it("marks an item as a call to action only while asked to", () => {
		const menu = new PaletteMenu();
		menu.addItem((item) => item.setTitle("Clear").setWarning(true).setCta());
		menu.showAtPosition({ x: 0, y: 0 });
		expect(itemNamed("Clear").classList.contains("mod-cta")).toBe(true);

		menu.close();
		menu.showAtPosition({ x: 0, y: 0 });
		expect(itemNamed("Clear").classList.contains("mod-cta")).toBe(true);
	});
});

describe("PaletteMenu clicks", () => {
	it("runs an item and closes the menu", () => {
		const { menu, run } = sample();
		const onHide = vi.fn();
		menu.onHide(onHide);
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Open").click();

		expect(run).toHaveBeenCalledTimes(1);
		expect(document.querySelector(".menu")).toBeNull();
		expect(onHide).toHaveBeenCalledTimes(1);
	});

	it("keeps the menu open for a keep-open item and updates its title", () => {
		const menu = new PaletteMenu();
		let clear!: { setTitle(title: string): unknown };
		menu.addItem((item) => {
			clear = item
				.setTitle("Clear search history")
				.setWarning(true)
				.setKeepOpen()
				.onClick(() => clear.setTitle("Click again to clear"));
		});
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Clear search history").click();

		expect(document.querySelector(".menu")).not.toBeNull();
		expect(titleOf(document.querySelector(".menu"))).toBe("Click again to clear");
	});

	it("ignores clicks on a disabled item", () => {
		const { menu, run } = sample();
		const onHide = vi.fn();
		menu.onHide(onHide);
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Disabled").click();

		expect(document.querySelector(".menu")).not.toBeNull();
		expect(onHide).not.toHaveBeenCalled();
		expect(run).not.toHaveBeenCalled();
	});

	it("closes on a press outside, and keeps focus on the press inside", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		const inside = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
		itemNamed("Open").querySelector(".menu-item-title")?.dispatchEvent(inside);
		expect(inside.defaultPrevented).toBe(true);
		expect(document.querySelector(".menu")).not.toBeNull();

		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
		expect(document.querySelector(".menu")).toBeNull();
	});
});

describe("PaletteMenu keyboard", () => {
	it("moves with the arrows past disabled items and wraps around", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		press("ArrowDown");
		expect(selectedTitle()).toBe("Open");
		press("ArrowDown");
		expect(selectedTitle()).toBe("Help");
		press("ArrowDown");
		expect(selectedTitle()).toBe("Open");
		press("ArrowUp");
		expect(selectedTitle()).toBe("Help");
	});

	it("jumps to the first and last enabled items with Home and End", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		press("End");
		expect(selectedTitle()).toBe("Help");
		press("Home");
		expect(selectedTitle()).toBe("Open");
	});

	it("runs the selected item on Enter, and stops the key", () => {
		const { menu, run } = sample();
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown");

		const event = press("Enter");

		expect(run).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("keeps the menu open after Enter on a keep-open item", () => {
		const menu = new PaletteMenu();
		const run = vi.fn();
		menu.addItem((item) => item.setTitle("Toggle").setKeepOpen().onClick(run));
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown");

		press("Enter");
		press("Enter");

		expect(run).toHaveBeenCalledTimes(2);
		expect(document.querySelector(".menu")).not.toBeNull();
	});

	it("closes on Escape and keeps the key from the palette input", () => {
		const { menu } = sample();
		const input = document.body.appendChild(createEl("input"));
		input.focus();
		const seen = vi.fn();
		input.addEventListener("keydown", seen);
		menu.showAtPosition({ x: 0, y: 0 });

		const event = press("Escape", input);

		expect(document.querySelector(".menu")).toBeNull();
		expect(event.defaultPrevented).toBe(true);
		expect(seen).not.toHaveBeenCalled();
	});

	it("selects the first enabled item only when opened with selectFirst", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });
		expect(selectedTitle()).toBeNull();
		menu.hide();

		menu.showAtPosition({ x: 0, y: 0 }, { selectFirst: true });
		expect(selectedTitle()).toBe("Open");
	});

	it("selects an enabled item under the pointer, but not a disabled one", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });

		itemNamed("Disabled").dispatchEvent(new Event("pointerover", { bubbles: true }));
		expect(selectedTitle()).toBeNull();
		itemNamed("Help").dispatchEvent(new Event("pointerover", { bubbles: true }));
		expect(selectedTitle()).toBe("Help");
	});
});

describe("PaletteMenu hiding", () => {
	it("close() hides the menu the same way hide() does", () => {
		const { menu } = sample();
		menu.showAtPosition({ x: 0, y: 0 });
		menu.close();
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("calls onHide once when closed, and not when reopened", () => {
		const { menu } = sample();
		const onHide = vi.fn();
		menu.onHide(onHide);
		menu.showAtPosition({ x: 0, y: 0 });
		menu.showAtPosition({ x: 5, y: 5 });
		expect(onHide).not.toHaveBeenCalled();
		expect(document.querySelectorAll(".menu")).toHaveLength(1);

		menu.close();
		expect(onHide).toHaveBeenCalledTimes(1);
		menu.close();
		expect(onHide).toHaveBeenCalledTimes(1);
	});
});

describe("PaletteMenu selection", () => {
	it("reports the item that becomes selected, and none when the menu closes", () => {
		const { menu } = sample();
		const selected: Array<string | undefined> = [];
		menu.onSelectionChange((item) => selected.push(item ? titleOfItem(item) : undefined));
		menu.showAtPosition({ x: 0, y: 0 });
		press("ArrowDown");
		press("ArrowDown");
		menu.close();

		expect(selected).toEqual(["Open", "Help", undefined]);
	});
});

const keymap = { pushScope: vi.fn(), popScope: vi.fn() };

function filterMenu(minItems = 3) {
	const menu = new PaletteMenu().enableFilter({ keymap } as unknown as App, minItems);
	const runs = { copy: vi.fn(), open: vi.fn(), rename: vi.fn() };
	menu.addItem((item) => item.setTitle("Open in terminal").onClick(runs.open));
	menu.addSeparator();
	menu.addItem((item) => item.setTitle("Copy file name").onClick(runs.copy));
	menu.addItem((item) => item.setTitle("Rename…").onClick(runs.rename));
	return { menu, runs };
}

function filterInput(): HTMLInputElement {
	const input = document.querySelector<HTMLInputElement>(".my-palette-menu-filter__input");
	if (!input) throw new Error("no filter input");
	return input;
}

function type(text: string): void {
	const input = filterInput();
	input.value = text;
	input.dispatchEvent(new Event("input", { bubbles: true }));
}

function visibleTitles(): string[] {
	return [...document.querySelectorAll<HTMLElement>(".menu-item:not(.is-filtered)")].map(
		(element) => titleOf(element) ?? "",
	);
}

describe("PaletteMenu filter", () => {
	it("takes focus when opened, so typing never reaches the palette input", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(document.activeElement).toBe(filterInput());
	});

	it("holds its own keymap scope while open, so a modal cannot pull focus back", () => {
		keymap.pushScope.mockClear();
		keymap.popScope.mockClear();
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		expect(keymap.pushScope).toHaveBeenCalledOnce();

		menu.close();
		expect(keymap.popScope).toHaveBeenCalledExactlyOnceWith(keymap.pushScope.mock.calls[0][0]);
	});

	it("pushes no scope for a menu too short to show the field", () => {
		keymap.pushScope.mockClear();
		const { menu } = filterMenu(4);
		menu.showAtPosition({ x: 0, y: 0 });
		expect(keymap.pushScope).not.toHaveBeenCalled();
	});

	it("hides actions missing any typed word, ignoring case", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		type("FILE na");
		expect(visibleTitles()).toEqual(["Copy file name"]);
		type("");
		expect(visibleTitles()).toEqual(["Open in terminal", "Copy file name", "Rename…"]);
	});

	it("selects the first match, and Enter runs it", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		type("e");
		expect(selectedTitle()).toBe("Open in terminal");
		press("ArrowDown", filterInput());
		press("Enter", filterInput());

		expect(runs.copy).toHaveBeenCalledOnce();
		expect(document.querySelector(".menu")).toBeNull();
	});

	it("shows an empty message when nothing matches", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });

		type("zzz");
		expect(document.querySelector(".my-palette-menu-empty.is-visible")).not.toBeNull();
		expect(selectedTitle()).toBeNull();
		type("");
		expect(document.querySelector(".my-palette-menu-empty.is-visible")).toBeNull();
	});

	it("lets Space and Home reach the text field instead of acting on the menu", () => {
		const { menu, runs } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		type("e");

		expect(press(" ", filterInput()).defaultPrevented).toBe(false);
		expect(press("Home", filterInput()).defaultPrevented).toBe(false);
		expect(runs.open).not.toHaveBeenCalled();
	});

	it("clears the words when the menu is shown again", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		type("rename");
		menu.close();
		menu.showAtPosition({ x: 0, y: 0 });

		expect(filterInput().value).toBe("");
		expect(visibleTitles()).toHaveLength(3);
	});

	it("skips the field when the menu has fewer actions than the minimum", () => {
		const { menu } = filterMenu(4);
		menu.showAtPosition({ x: 0, y: 0 });

		expect(filterInput().closest(".my-palette-menu-filter")?.hasAttribute("hidden")).toBe(true);
		expect(document.activeElement).not.toBe(filterInput());
	});

	it("keeps a click on the field from stealing or losing focus", () => {
		const { menu } = filterMenu();
		menu.showAtPosition({ x: 0, y: 0 });
		const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
		filterInput().dispatchEvent(press);

		expect(press.defaultPrevented).toBe(false);
	});
});

describe("PaletteMenu focus and placement", () => {
	it("gives focus back to the element it had before opening", () => {
		const { menu } = sample();
		const input = document.body.appendChild(createEl("input"));
		input.focus();
		menu.showAtPosition({ x: 0, y: 0 });
		(document.activeElement as HTMLElement).blur();

		press("Escape");

		expect(document.activeElement).toBe(input);
	});

	it("keeps the focus the user moved to another input", () => {
		const { menu } = sample();
		const input = document.body.appendChild(createEl("input"));
		const other = document.body.appendChild(createEl("input"));
		input.focus();
		menu.showAtPosition({ x: 0, y: 0 });
		other.focus();

		document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

		expect(document.activeElement).toBe(other);
	});

	it("opens in the document it is given", () => {
		const { menu } = sample();
		const popout = new Window();
		menu.showAtPosition({ x: 0, y: 0 }, { doc: popout.document as unknown as Document });

		expect(popout.document.querySelector(".menu")).not.toBeNull();
		expect(document.querySelector(".menu")).toBeNull();
	});
});

describe("placeMenu", () => {
	const viewport = { width: 500, height: 500 };
	const size = { width: 100, height: 50 };

	it("opens just below and to the right of the pointer when it fits", () => {
		expect(placeMenu({ x: 10, y: 20 }, size, viewport)).toEqual({ left: 12, top: 22 });
	});

	it("flips to the left of the pointer near the right edge", () => {
		expect(placeMenu({ x: 450, y: 20 }, size, viewport).left).toBe(348);
	});

	it("flips above the pointer near the bottom edge", () => {
		expect(placeMenu({ x: 10, y: 470 }, size, viewport).top).toBe(418);
	});

	it("never goes past the top or left edge", () => {
		expect(
			placeMenu({ x: 10, y: 10 }, { width: 300, height: 300 }, { width: 100, height: 100 }),
		).toEqual({
			left: 0,
			top: 0,
		});
	});
});
