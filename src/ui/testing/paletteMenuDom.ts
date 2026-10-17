/** PaletteMenu が文書に描くメニューのためのテスト用ヘルパー。 */

function openMenuItems(): HTMLElement[] {
	const menu = document.querySelector<HTMLElement>(".menu");
	return menu ? [...menu.querySelectorAll<HTMLElement>(".menu-item")] : [];
}

function titleOf(item: HTMLElement): string {
	return item.querySelector(".menu-item-title")?.textContent ?? "";
}

export function isPaletteMenuOpen(): boolean {
	return document.querySelector(".menu") !== null;
}

/** Titles of the open menu's items, in order. Empty when no menu is open. */
export function paletteMenuTitles(): string[] {
	return openMenuItems().map(titleOf);
}

/** Clicks the open menu's item with this title. Fails the test when there is no such item. */
export function clickPaletteMenuItem(title: string): void {
	const item = openMenuItems().find((element) => titleOf(element) === title);
	if (!item) throw new Error(`no open menu item: ${title}`);
	item.click();
}

/** Clicks the open menu's item at this index, counting every item including disabled ones. */
export function clickPaletteMenuItemAt(index: number): void {
	const item = openMenuItems()[index];
	if (!item) throw new Error(`no open menu item at index ${index}`);
	item.click();
}
