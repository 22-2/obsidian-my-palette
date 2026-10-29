import { Component } from "obsidian";
import { matchesHotkey, type PaletteHotkey, type PaletteHotkeys } from "src/ui/hotkeys";

export function registerPreviewTransparency(
	component: Component,
	rootEl: HTMLElement,
	container: HTMLElement,
	inputEl: HTMLInputElement,
	getHotkeys: () => PaletteHotkeys,
): void {
	let held: PaletteHotkey | undefined;
	container.addClass("my-palette-preview-surface");
	const restore = (returnFocus = false) => {
		// この窓の他のパネルも同じ窓を共有する。隠れているパネルだけがフォーカスを戻す。
		if (!container.hasClass("is-preview-hidden")) return;
		container.removeClass("is-preview-hidden");
		held = undefined;
		if (returnFocus && inputEl.isConnected) inputEl.focus({ preventScroll: true });
	};
	component.registerDomEvent(
		rootEl,
		"keydown",
		(event) => {
			const hotkey = getHotkeys().hidePreview;
			if (!matchesHotkey(event, hotkey)) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			held = hotkey ?? undefined;
			container.addClass("is-preview-hidden");
		},
		true,
	);
	const ownerWindow = rootEl.ownerDocument.defaultView;
	if (!ownerWindow) return;
	// フォーカスは、フェードしたパネルから離れることがある。キーを離すことと、アプリの切り替えでも戻す。
	component.registerDomEvent(
		ownerWindow,
		"keyup",
		(event) => {
			if (!held) return;
			const key = event.key === " " ? "Space" : event.key;
			const modifier = key === "Control" ? "Ctrl" : key;
			if (
				key.toUpperCase() === held.key.toUpperCase() ||
				held.modifiers.some((item) => item === modifier)
			)
				restore(true);
		},
		true,
	);
	component.registerDomEvent(ownerWindow, "blur", () => restore());
}
