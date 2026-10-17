export interface PanelChoiceItem<T extends string> {
	value: T;
	label: string;
	icon?: string;
}

export interface PanelChoiceOptions<T extends string> {
	id: string;
	/** オプションのメニューで、項目の上に出す見出し。 */
	label: string;
	items: readonly PanelChoiceItem<T>[];
	value: T;
	onChange: (value: T) => void;
}

/** 値の型が何であれ、オプションのメニューが選択肢から読むもの。 */
export interface MenuChoice {
	readonly label: string;
	readonly isHidden: boolean;
	readonly value: string;
	readonly items: readonly PanelChoiceItem<string>[];
	choose(value: string): void;
}

/**
 * パレットの「1つだけ選ぶ」オプション。Vault 監査が一覧にする種類など。PanelSwitch と同じく
 * 状態だけを持つ。項目を並べて選ばれたものに印を付けるのは、オプションのメニューの役目。
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

	/** 通知せずに値を示す。ホストが自分の値を復元するときに使う。 */
	set(value: T): void {
		this.current = value;
	}

	/** 隠された選択肢はオプションのメニューから外れるが、値は保たれる。 */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	/** 項目を選び、ホストに通知する。現在の値を選んでも何もしない。 */
	choose(value: T): void {
		if (value === this.current) return;
		this.current = value;
		this.options.onChange(value);
	}
}
