export interface PanelChoiceItem<T extends string> {
	value: T;
	label: string;
	icon?: string;
}

export interface PanelChoiceOptions<T extends string> {
	id: string;
	/** The heading the items are listed under in the options menu. */
	label: string;
	items: readonly PanelChoiceItem<T>[];
	value: T;
	onChange: (value: T) => void;
}

/** What the options menu reads from a choice, whatever the type of its values. */
export interface MenuChoice {
	readonly label: string;
	readonly isHidden: boolean;
	readonly value: string;
	readonly items: readonly PanelChoiceItem<string>[];
	choose(value: string): void;
}

/**
 * A pick-one option of a palette, such as the kind Vault audit lists. Like PanelSwitch it
 * only holds the state; the options menu lists the items and marks the chosen one.
 */
export class PanelChoice<T extends string = string> implements MenuChoice {
	private current: T;
	private hidden = false;

	constructor(private readonly options: PanelChoiceOptions<T>) {
		this.current = options.value;
	}

	get value(): T {
		return this.current;
	}

	get id(): string {
		return this.options.id;
	}

	get label(): string {
		return this.options.label;
	}

	get items(): readonly PanelChoiceItem<T>[] {
		return this.options.items;
	}

	get isHidden(): boolean {
		return this.hidden;
	}

	/** Shows the value without notifying, for hosts restoring their own value. */
	set(value: T): void {
		this.current = value;
	}

	/** A hidden choice leaves the options menu; its value is kept. */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	/** Chooses an item and notifies the host; choosing the current one does nothing. */
	choose(value: T): void {
		if (value === this.current) return;
		this.current = value;
		this.options.onChange(value);
	}
}
