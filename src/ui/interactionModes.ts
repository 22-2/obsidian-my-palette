import { DEFAULT_HOTKEYS, matchesHotkey, type PaletteHotkeys } from "src/ui/hotkeys";

export type InteractionMode = "input" | "selection";

/** What a key press means for the modes; the panel carries it out on its list. */
export type InteractionModeCommand = "to-input" | "enter-list" | "selection-space";

/**
 * Input/selection modes for selectors whose single-key commands (Space to
 * check, f to return) must not reach the query. Kept apart from the panel so
 * hosts without such commands, like the palette, can leave modes off and keep
 * Enter and the highlighted first row working directly from the input.
 */
export class InteractionModes {
	private mode: InteractionMode = "input";

	constructor(
		private readonly rootEl: HTMLElement,
		private readonly inputEl: HTMLInputElement,
		private readonly getHotkeys: () => PaletteHotkeys = () => DEFAULT_HOTKEYS,
	) {}

	set(mode: InteractionMode): void {
		this.mode = mode;
		this.rootEl.classList.toggle("is-input-mode", mode === "input");
		// Retain DOM focus for list shortcuts while blocking typing, paste and IME
		// from changing the query until the user explicitly returns to input mode.
		this.inputEl.readOnly = mode === "selection";
	}

	/** Classifies a key press; undefined leaves it to the panel's normal handling. */
	command(event: KeyboardEvent, atFirstRow: boolean): InteractionModeCommand | undefined {
		if (event.isComposing) return undefined;
		const arrow = event.key === "ArrowDown" || event.key === "ArrowUp";
		if (this.mode === "input") return arrow ? "enter-list" : undefined;
		// Why: ArrowDown from the input enters the list, so ArrowUp past the first
		// row should leave it symmetrically instead of stopping at a dead end.
		// Shift extends a range there, so only a plain ArrowUp leaves.
		if (event.key === "ArrowUp")
			return atFirstRow &&
				!event.shiftKey &&
				!event.ctrlKey &&
				!event.metaKey &&
				!event.altKey
				? "to-input"
				: undefined;
		const hotkeys = this.getHotkeys();
		if (matchesHotkey(event, hotkeys.focusInput)) return "to-input";
		if (matchesHotkey(event, hotkeys.toggleSelection, true)) return "selection-space";
		return undefined;
	}
}
