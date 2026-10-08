import { setIcon, type Component } from "obsidian";

export interface SourcePinControlOptions {
	/** The component whose lifecycle owns the button's DOM listeners. */
	owner: Component;
	statusBarEl: HTMLElement;
	isPinned: () => boolean;
	onToggle: () => void;
}

/** Footer button that pins or unpins the note a palette view searches from. */
export class SourcePinControl {
	private readonly buttonEl: HTMLButtonElement;

	constructor(private readonly options: SourcePinControlOptions) {
		const { owner, statusBarEl } = options;
		this.buttonEl = statusBarEl.createEl("button", {
			cls: "clickable-icon my-palette-source-pin",
			attr: { type: "button" },
		});
		// Why: createEl appends after the result count; prepend keeps the pin action
		// immediately beside the Source label as the footer's context control.
		statusBarEl.prepend(this.buttonEl);
		owner.registerDomEvent(this.buttonEl, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		owner.registerDomEvent(this.buttonEl, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			options.onToggle();
		});
		this.update();
	}

	update(): void {
		const pinned = this.options.isPinned();
		this.buttonEl.empty();
		setIcon(this.buttonEl, pinned ? "pin-off" : "pin");
		const action = pinned ? "Unpin source note" : "Pin source note";
		this.buttonEl.setAttribute("aria-label", action);
		this.buttonEl.setAttribute("title", action);
		this.buttonEl.setAttribute("aria-pressed", String(pinned));
	}
}
