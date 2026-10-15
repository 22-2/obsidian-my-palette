export interface PanelSwitchOptions {
	/** Identifies the switch so a reopened modal replaces it instead of adding another. */
	id: string;
	label: string;
	/** Shown beside the switch in the options menu, like the other menu items. */
	icon?: string;
	description: string;
	value: boolean;
	onChange: (value: boolean) => void;
}

/**
 * An on/off option of a palette or selector, such as including Obsidian-excluded files.
 * It only holds the state; the options menu lists it and flips it.
 */
export class PanelSwitch {
	private current: boolean;
	private hidden = false;

	constructor(private readonly options: PanelSwitchOptions) {
		this.current = options.value;
	}

	get value(): boolean {
		return this.current;
	}

	get id(): string {
		return this.options.id;
	}

	get label(): string {
		return this.options.label;
	}

	get icon(): string | undefined {
		return this.options.icon;
	}

	get description(): string {
		return this.options.description;
	}

	/** Whether the switch is currently hidden because it does not apply to the screen. */
	get isHidden(): boolean {
		return this.hidden;
	}

	/** Shows the state without notifying, for hosts restoring their own value. */
	set(value: boolean): void {
		this.current = value;
	}

	/** A hidden switch leaves the options menu; its value is kept. */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	/** Flips the switch and notifies the host. */
	flip(): void {
		this.set(!this.current);
		this.options.onChange(this.current);
	}
}
