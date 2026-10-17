export interface PanelSwitchOptions {
	/** スイッチを特定する。開き直したモーダルは、もう1つ足す代わりにこれを置き換える。 */
	id: string;
	label: string;
	/** オプションのメニューで、ほかのメニュー項目と同じようにスイッチの横に出す。 */
	icon?: string;
	description: string;
	value: boolean;
	onChange: (value: boolean) => void;
}

/**
 * パレットやセレクターのオン/オフのオプション。Obsidian の除外ファイルを含めるなど。
 * 状態だけを持つ。オプションのメニューがそれを並べ、切り替える。
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

	/** 画面に当てはまらないため、いまスイッチが隠れているかどうか。 */
	get isHidden(): boolean {
		return this.hidden;
	}

	/** 通知せずに状態を示す。ホストが自分の値を復元するときに使う。 */
	set(value: boolean): void {
		this.current = value;
	}

	/** 隠されたスイッチはオプションのメニューから外れるが、値は保たれる。 */
	setHidden(hidden: boolean): void {
		this.hidden = hidden;
	}

	/** スイッチを反転し、ホストに通知する。 */
	flip(): void {
		this.set(!this.current);
		this.options.onChange(this.current);
	}
}
