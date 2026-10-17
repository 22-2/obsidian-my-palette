import { Scope, setIcon, type App, type IconName } from "obsidian";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

export interface PaletteMenuPosition {
	x: number;
	y: number;
}

export interface PaletteMenuShowOptions {
	/** メニューを表示する文書。既定は親要素の文書、なければ現在の文書。 */
	doc?: Document;
	/** 最初の有効な項目を選んだ状態で開く(キーボードから開いたとき)。 */
	selectFirst?: boolean;
}

export type PaletteMenuActivation = MouseEvent | KeyboardEvent;

/** 取り消しにくい操作。2回押したときだけ実行する。 */
export interface ConfirmedMenuItemOptions {
	title: string;
	/** 1回目の押下のあとに出す。例: 「もう一度クリックして消去」。 */
	confirmTitle: string;
	icon: IconName;
	tooltip?: string;
	/** 何かを破壊する操作は赤くする。既定は true。 */
	warning?: boolean;
	run: () => void;
}

const GAP = 2;

/**
 * メニューをポインターの位置に置き、表示領域から出そうなら反対側に寄せる。
 * Obsidian の Menu と同じく、右端や下端からはみ出すメニューはポインターの左や上に移る。
 */
export function placeMenu(
	position: PaletteMenuPosition,
	size: { width: number; height: number },
	viewport: { width: number; height: number },
): { left: number; top: number } {
	const { x, y } = position;
	const left =
		x + GAP + size.width <= viewport.width ? x + GAP : Math.max(0, x - GAP - size.width);
	const top =
		y + GAP + size.height <= viewport.height ? y + GAP : Math.max(0, y - GAP - size.height);
	return { left, top };
}

/**
 * Obsidian の Menu と同じ DOM とクラスで描くメニュー。見た目は Obsidian の CSS が担う。
 * このクラスは、開いたままにする項目、キーボードの移動、外側の押下、フォーカスの復元を自分で扱う。
 */
export class PaletteMenu {
	readonly dom: HTMLElement;
	private readonly scrollEl: HTMLElement;
	private readonly items: PaletteMenuItem[] = [];
	private group: HTMLElement | null = null;
	private selected = -1;
	private parentEl: HTMLElement | null = null;
	private openDoc: Document | null = null;
	private restoreFocusTo: HTMLElement | null = null;
	private hideCallback: (() => void) | null = null;
	private selectionListener: ((item: PaletteMenuItem | undefined) => void) | null = null;
	private filter: MenuFilter | null = null;

	constructor() {
		this.dom = createDiv();
		this.dom.className = "menu";
		this.dom.setAttribute("role", "menu");
		this.scrollEl = this.dom.createDiv("menu-scroll");
		// Why: メニューの上の押下で、パレットの入力欄からフォーカスが離れてはいけない。
		// メニューの中でフォーカスを取らなければならないのは、絞り込みの入力欄だけ。
		this.dom.addEventListener("mousedown", (event) => {
			if (event.button === 0 && event.target !== this.filter?.inputEl) event.preventDefault();
		});
		this.scrollEl.addEventListener("pointerover", (event) => this.onPointerOver(event));
	}

	addItem(build: (item: PaletteMenuItem) => void): this {
		const item = new PaletteMenuItem(this);
		this.items.push(item);
		if (!this.group) this.group = this.scrollEl.createDiv("menu-group");
		this.group.appendChild(item.dom);
		build(item);
		return this;
	}

	/**
	 * 1回目の押下で、その項目はメニューを開いたままにする確認に変わり、2回目の押下で実行してメニューを閉じる。
	 * ほかの項目へ移ると確認は取り消されるので、後の押下は最初からやり直す。メニューには
	 * そのような項目を最大1つだけ持てる。
	 */
	addConfirmedItem({
		title,
		confirmTitle,
		icon,
		tooltip,
		warning = true,
		run,
	}: ConfirmedMenuItemOptions): this {
		let confirming = false;
		let confirmedItem: PaletteMenuItem | undefined;
		const render = (item: PaletteMenuItem) =>
			item
				.setTitle(confirming ? confirmTitle : title)
				.setCta(confirming)
				.setKeepOpen(confirming);
		this.addItem((item) => {
			confirmedItem = item;
			item.setIcon(icon).setWarning(warning);
			if (tooltip) item.setTooltip(tooltip);
			render(item);
			item.onClick(() => {
				if (!confirming) {
					confirming = true;
					render(item);
					return;
				}
				// Why: 1回目の押下でメニューを開いたままにしていたので、それを解除しないと今も開いたままになる。
				item.setKeepOpen(false);
				run();
			});
		});
		return this.onSelectionChange((selected) => {
			if (!confirming || !confirmedItem || selected === confirmedItem) return;
			confirming = false;
			render(confirmedItem);
		});
	}

	/**
	 * 後ろに続く項目の名前になる、控えめなラベルを加える。項目ではないので、キーボードと絞り込みは
	 * それを飛ばし、無効になったコマンドには見えない。
	 */
	addHeading(title: string): this {
		if (!this.group) this.group = this.scrollEl.createDiv("menu-group");
		this.group.createDiv({ cls: "my-palette-menu-heading", text: title });
		return this;
	}

	addSeparator(): this {
		// Why: 前に項目がない区切り、または別の区切りの直後の区切りは、無関係な線に見えてしまう。
		if (!this.group) return this;
		this.scrollEl.createDiv("menu-separator").setAttribute("role", "separator");
		this.group = null;
		return this;
	}

	/**
	 * 操作の上に入力欄を加える。メニューが開いている間、入力すると、背後のパレットには届かず、
	 * 入力したすべての語を含むタイトルの操作だけに一覧を絞る。`minItems` より少ない操作しかない
	 * メニューは、絞り込むものがないので入力欄を省く。
	 */
	enableFilter(app: App, minItems = 5): this {
		if (this.filter) return this;
		const wrapEl = createDiv("my-palette-menu-filter");
		const inputEl = wrapEl.createEl("input", {
			cls: "my-palette-menu-filter__input",
			attr: {
				type: "text",
				placeholder: t("menu.filter.placeholder"),
				"aria-label": t("menu.filter.label"),
			},
		});
		this.dom.insertBefore(wrapEl, this.scrollEl);
		const emptyEl = this.scrollEl.createDiv({
			cls: "my-palette-menu-empty",
			text: t("menu.filter.noMatch"),
		});
		inputEl.addEventListener("input", () => this.applyFilter());
		this.filter = { app, wrapEl, inputEl, emptyEl, minItems, active: false, scope: null };
		return this;
	}

	/** すべての操作をもう一度表示し、入力した語を消す。 */
	private resetFilter(): void {
		const filter = this.filter;
		if (!filter) return;
		filter.active = this.items.length >= filter.minItems;
		filter.wrapEl.toggleAttribute("hidden", !filter.active);
		filter.inputEl.value = "";
		this.applyFilter();
	}

	private applyFilter(): void {
		const filter = this.filter;
		if (!filter) return;
		const words = filter.inputEl.value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
		const filtering = words.length > 0;
		for (const item of this.items) {
			const title = item.title.toLocaleLowerCase();
			item.setFiltered(filtering && !words.every((word) => title.includes(word)));
		}
		// Why: 両隣が消えると、グループの間の区切りは無関係な線に見えてしまう。
		for (const separator of this.scrollEl.querySelectorAll(".menu-separator"))
			separator.toggleClass("is-filtered", filtering);
		for (const group of this.scrollEl.querySelectorAll(".menu-group"))
			group.toggleClass("is-filtered", !group.querySelector(".menu-item:not(.is-filtered)"));
		filter.emptyEl.toggleClass(
			"is-visible",
			filtering && this.items.every((item) => item.isFiltered),
		);
		this.setSelected(-1);
		if (filtering) this.focusEnabled(0, 1);
	}

	setParentElement(parentEl: HTMLElement): this {
		this.parentEl = parentEl;
		return this;
	}

	onHide(callback: () => void): void {
		this.hideCallback = callback;
	}

	/** 選択が動くたびに、新しく選ばれた項目(または undefined)で呼び戻す。 */
	onSelectionChange(listener: (item: PaletteMenuItem | undefined) => void): this {
		this.selectionListener = listener;
		return this;
	}

	showAtMouseEvent(event: MouseEvent, options: Omit<PaletteMenuShowOptions, "doc"> = {}): void {
		this.showAtPosition({ x: event.clientX, y: event.clientY }, { ...options, doc: event.doc });
	}

	showAtPosition(position: PaletteMenuPosition, options: PaletteMenuShowOptions = {}): void {
		// Why: 開き直すときは、hide を経ずに開いているメニューを置き換える。次に閉じるときのために onHide は登録したままにする。
		this.teardown();
		if (this.items.length === 0) return;

		const doc = options.doc ?? this.parentEl?.ownerDocument ?? document;
		const win = doc.defaultView ?? window;
		this.openDoc = doc;
		this.restoreFocusTo = doc.activeElement as HTMLElement | null;
		this.parentEl?.addClass("has-active-menu");
		doc.body.appendChild(this.dom);

		const { left, top } = placeMenu(
			position,
			{ width: this.dom.offsetWidth, height: this.dom.offsetHeight },
			{ width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
		);
		this.dom.style.left = `${left}px`;
		this.dom.style.top = `${top}px`;

		// Why: キャプチャ段階は、パレット自身の行が押下を処理する前にそれを見るので、
		// どの行も個別に閉じなくても、外側のどの押下でもメニューが閉じる。
		doc.addEventListener("mousedown", this.onOutsidePress, true);
		doc.addEventListener("keydown", this.onKeyDown, true);
		win.addEventListener("resize", this.onWindowChange);
		win.addEventListener("blur", this.onWindowChange);

		this.resetFilter();
		if (this.filter?.active) {
			this.filter.scope = new Scope();
			this.filter.app.keymap.pushScope(this.filter.scope);
			if (!doc.body.classList.contains("is-mobile"))
				this.filter.inputEl.focus({ preventScroll: true });
		}
		if (options.selectFirst) this.focusEnabled(0, 1);
	}

	hide(): void {
		if (!this.openDoc) return;
		this.teardown();
		const callback = this.hideCallback;
		this.hideCallback = null;
		callback?.();
	}

	/** `hide()` と同じ。Obsidian の Menu が使う名前で。 */
	close(): void {
		this.hide();
	}

	/** 開いているメニューとそのリスナーを取り除く。`onHide` は呼ばないので、開き直しで再利用できる。 */
	private teardown(): void {
		const doc = this.openDoc;
		if (!doc) return;
		const win = doc.defaultView ?? window;
		doc.removeEventListener("mousedown", this.onOutsidePress, true);
		doc.removeEventListener("keydown", this.onKeyDown, true);
		win.removeEventListener("resize", this.onWindowChange);
		win.removeEventListener("blur", this.onWindowChange);
		this.openDoc = null;
		if (this.filter?.scope) {
			this.filter.app.keymap.popScope(this.filter.scope);
			this.filter.scope = null;
		}
		this.setSelected(-1);
		this.parentEl?.removeClass("has-active-menu");
		this.dom.remove();

		const restore = this.restoreFocusTo;
		this.restoreFocusTo = null;
		// Why: フォーカスは、ほかに何も取っていないときだけ戻す。別の入力欄をクリックした場合はそのフォーカスを保つ。
		if (restore?.isConnected && (doc.activeElement === null || doc.activeElement === doc.body))
			restore.focus();
	}

	private readonly onOutsidePress = (event: MouseEvent): void => {
		if (!this.dom.contains(event.target as Node)) this.hide();
	};

	private readonly onWindowChange = (): void => this.hide();

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
		// 絞り込みが開いているとき、スペースとカーソルキーは入力欄のものになる。
		if (this.filter?.active && [" ", "Home", "End"].includes(event.key)) return;
		switch (event.key) {
			case "ArrowDown":
				this.focusEnabled(this.selected + 1, 1);
				break;
			case "ArrowUp":
				this.focusEnabled(
					this.selected < 0 ? this.items.length - 1 : this.selected - 1,
					-1,
				);
				break;
			case "Home":
				this.focusEnabled(0, 1);
				break;
			case "End":
				this.focusEnabled(this.items.length - 1, -1);
				break;
			case "Enter":
				this.items[this.selected]?.activate(event);
				break;
			case " ":
				if (this.selected < 0) return;
				this.items[this.selected]?.activate(event);
				break;
			case "Escape":
				this.hide();
				break;
			default:
				return;
		}
		// Why: キーはメニューが受け取るので、Escape と Enter は背後のパレットに届かない。
		event.preventDefault();
		event.stopPropagation();
	};

	private onPointerOver(event: PointerEvent): void {
		const index = this.items.findIndex((item) => item.dom.contains(event.target as Node));
		if (index >= 0 && !this.items[index].isDisabled) this.setSelected(index);
	}

	/** `start` から `direction` の向きに探し、最初の有効な項目を選ぶ。無効な項目は飛ばす。 */
	private focusEnabled(start: number, direction: 1 | -1): void {
		const count = this.items.length;
		for (let step = 0; step < count; step++) {
			const index = (((start + direction * step) % count) + count) % count;
			if (!this.items[index].isDisabled && !this.items[index].isFiltered) {
				this.setSelected(index);
				return;
			}
		}
	}

	private setSelected(index: number): void {
		this.items[this.selected]?.dom.removeClass("selected");
		this.selected = index;
		const item = this.items[index];
		if (item) {
			item.dom.addClass("selected");
			item.dom.scrollIntoView({ block: "nearest" });
		}
		this.selectionListener?.(item);
	}
}

interface MenuFilter {
	app: App;
	/**
	 * メニューが開いている間に積む。モーダルのスコープは、モーダルの外の要素からフォーカスを引き戻すため、
	 * 独自のスコープがなければ絞り込みの欄は決してフォーカスを保てない。
	 */
	scope: Scope | null;
	wrapEl: HTMLElement;
	inputEl: HTMLInputElement;
	emptyEl: HTMLElement;
	minItems: number;
	/** 開いているメニューで絞り込みの欄を出すかどうか。操作の数によって決まる。 */
	active: boolean;
}

/** メニューの項目。見た目の設定は、メニューが開いている間でも反映される。 */
export class PaletteMenuItem {
	readonly dom: HTMLElement;
	private readonly menu: PaletteMenu;
	private readonly iconEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private checkIconEl: HTMLElement | null = null;
	private switchEl: HTMLElement | null = null;
	private disabled = false;
	private filtered = false;
	private keepOpen = false;
	private callback: ((event: PaletteMenuActivation) => void) | null = null;

	constructor(menu: PaletteMenu) {
		this.menu = menu;
		this.dom = createDiv();
		this.dom.className = "menu-item tappable";
		this.dom.setAttribute("role", "menuitem");
		this.iconEl = this.dom.createDiv("menu-item-icon");
		this.titleEl = this.dom.createDiv("menu-item-title");
		this.dom.addEventListener("click", (event) => this.activate(event));
	}

	get isDisabled(): boolean {
		return this.disabled;
	}

	get title(): string {
		return this.titleEl.textContent ?? "";
	}

	/** メニューの絞り込みで、いまこの項目が隠れているかどうか。 */
	get isFiltered(): boolean {
		return this.filtered;
	}

	setFiltered(filtered: boolean): void {
		this.filtered = filtered;
		this.dom.toggleClass("is-filtered", filtered);
	}

	setTitle(title: string): this {
		this.titleEl.setText(title);
		return this;
	}

	setIcon(icon: IconName | null): this {
		if (icon) setIcon(this.iconEl, icon);
		else this.iconEl.empty();
		return this;
	}

	setChecked(checked: boolean): this {
		if (checked && !this.checkIconEl) {
			this.checkIconEl = this.dom.createDiv("menu-item-icon mod-checked");
			setIcon(this.checkIconEl, ICONS.check);
		} else if (!checked && this.checkIconEl) {
			this.checkIconEl.remove();
			this.checkIconEl = null;
		}
		this.dom.toggleClass("mod-checked", checked);
		this.dom.setAttribute("role", "menuitemcheckbox");
		this.dom.setAttribute("aria-checked", String(checked));
		return this;
	}

	/**
	 * 項目をオン/オフのスイッチとして示す。setChecked と違い、スイッチはどちらの状態でも描かれるので、
	 * オフのオプションも、オンにできるものとして読める。
	 */
	setSwitch(on: boolean): this {
		if (!this.switchEl) {
			this.switchEl = this.dom.createDiv("checkbox-container my-palette-menu-switch");
			this.switchEl.setAttribute("aria-hidden", "true");
		}
		this.switchEl.toggleClass("is-enabled", on);
		this.dom.setAttribute("role", "menuitemcheckbox");
		this.dom.setAttribute("aria-checked", String(on));
		return this;
	}

	/** すべてを言えないラベルのために、ツールチップで項目を説明する。 */
	setTooltip(text: string): this {
		this.dom.setAttribute("title", text);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		this.dom.toggleClass("is-disabled", disabled);
		this.dom.setAttribute("aria-disabled", String(disabled));
		return this;
	}

	setWarning(warning: boolean): this {
		this.dom.toggleClass("is-warning", warning);
		return this;
	}

	/** 確認の主な操作として項目に印を付ける。setWarning と組み合わせると、赤い目立つ操作になる。 */
	setCta(cta = true): this {
		this.dom.toggleClass("mod-cta", cta);
		return this;
	}

	/** この項目を有効にした後もメニューを開いたままにする。例: もう一度クリックして確認する操作。 */
	setKeepOpen(keepOpen = true): this {
		this.keepOpen = keepOpen;
		return this;
	}

	onClick(callback: (event: PaletteMenuActivation) => void): this {
		this.callback = callback;
		return this;
	}

	/** クリックまたはキーボードで有効にしたときに呼ぶ。無効な項目では何もしない。 */
	activate(event: PaletteMenuActivation): void {
		if (this.disabled) return;
		this.callback?.(event);
		if (!this.keepOpen) this.menu.hide();
	}
}
