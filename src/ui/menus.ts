import type { PaletteMenu } from "src/ui/paletteMenu";

const keyboardMenuEvents = new WeakSet<MouseEvent>();

/** キーボードから開いたメニューのための、合成されたイベントであることを示す。 */
export function markKeyboardMenuEvent(event: MouseEvent): MouseEvent {
	keyboardMenuEvents.add(event);
	return event;
}

/**
 * マウスのイベントの位置にメニューを開く。キーボードから開いたメニューは、最初の操作を選んだ状態で始まるので、
 * Enter がすぐ効く。
 */
export function showMenuAtEvent(menu: PaletteMenu, event: MouseEvent): void {
	// Why: ポインターのメニューは未選択の状態で開くので、キーボードから開いたメニューだけが最初の操作を選ぶ。
	menu.showAtMouseEvent(event, { selectFirst: keyboardMenuEvents.has(event) });
}
