export interface StatusToggleOptions {
	/** Identifies the toggle so a reopened modal replaces it instead of adding another. */
	id: string;
	label: string;
	/** Letter pressed with Ctrl in the search input, such as "M" for Ctrl+M. */
	ctrlKey: string;
	description: string;
	value: boolean;
	onChange: (value: boolean) => void;
}

type RegisterDomEvent = <K extends keyof HTMLElementEventMap>(
	el: HTMLElement,
	type: K,
	callback: (event: HTMLElementEventMap[K]) => unknown,
	options?: boolean | AddEventListenerOptions,
) => void;

/**
 * Small switch with a label and its shortcut, shown at the left end of a
 * palette footer. Both a click and Ctrl+key in the input flip it.
 */
export class StatusToggle {
	private readonly el: HTMLElement;
	private readonly switchEl: HTMLElement;
	private readonly hint: string;
	private current: boolean;
	private hidden = false;

	constructor(
		statusBarEl: HTMLElement,
		inputEl: HTMLInputElement,
		register: RegisterDomEvent,
		private readonly options: StatusToggleOptions,
	) {
		const hint = `Ctrl+${options.ctrlKey.toUpperCase()}`;
		this.hint = hint;
		const previous = statusBarEl.querySelector(`[data-status-toggle="${options.id}"]`);
		const toggles = statusBarEl.querySelectorAll(".my-palette-status-toggle");
		const last = toggles[toggles.length - 1];
		// Created from the footer so a popout palette builds it in its own document.
		this.el = statusBarEl.createDiv({
			cls: "my-palette-status-toggle",
			attr: { role: "switch", "data-status-toggle": options.id },
		});
		// A reopened modal adds its switches again; keep each one in its place.
		// New ones line up in the order they were added, ahead of the footer text.
		if (previous) previous.replaceWith(this.el);
		else if (last) last.after(this.el);
		else statusBarEl.prepend(this.el);
		this.switchEl = this.el.createDiv({ cls: "checkbox-container" });
		this.el.createSpan({ text: options.label });
		this.el.createSpan({ cls: "my-palette-status-toggle__hint", text: hint });
		this.el.setAttribute("title", `${options.description} (${hint})`);
		// Why: a press on the footer must not pull focus out of the input.
		register(this.el, "mousedown", (event) => event.preventDefault());
		register(this.el, "click", () => this.flip());
		register(
			inputEl,
			"keydown",
			(event) => {
				if (event.key.toLowerCase() !== options.ctrlKey.toLowerCase() || !event.ctrlKey)
					return;
				if (event.altKey || event.shiftKey || event.metaKey || this.hidden) return;
				event.preventDefault();
				event.stopPropagation();
				this.flip();
			},
			true,
		);
		this.current = options.value;
		this.render();
	}

	get value(): boolean {
		return this.current;
	}

	/** Shows the state without notifying, for hosts restoring their own value. */
	set(value: boolean): void {
		this.current = value;
		this.render();
	}

	/** A hidden toggle leaves the footer and ignores the shortcut; its value is kept. */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
		this.render();
	}

	private flip(): void {
		this.set(!this.current);
		this.options.onChange(this.current);
	}

	private render(): void {
		this.switchEl.toggleClass("is-enabled", this.current);
		this.el.setAttribute("aria-checked", String(this.current));
		this.el.toggleAttribute("hidden", this.hidden);
	}
}
