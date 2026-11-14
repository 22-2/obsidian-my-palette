import { Scope, setIcon, setTooltip, type App, type IconName } from "obsidian";
import { ICONS } from "src/core/icons";
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

const GAP = 2;

/** 全角スペース(U+3000)。日本語の入力では半角と同じく、スイッチの切り替えに使えるようにする。 */
const FULL_WIDTH_SPACE = "　";

function isSpaceKey(event: KeyboardEvent): boolean {
	// Why: IME が有効だと keydown の key は "Process" になる。物理キーを表す code で判定する。
	return event.key === " " || event.key === FULL_WIDTH_SPACE || event.code === "Space";
}

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

/** ポインターが項目に乗ってから、サブメニューを開く・閉じるまでの待ち時間(ms)。Obsidian の Menu と同じ値。 */
const SUBMENU_DELAY_MS = 250;

/**
 * サブメニューを親メニューの端に重ねる幅(px)。重ねるので、ポインターが親から子へ渡る間に隙間ができず、
 * 閉じる待ち時間の間にポインターが外へ出たと見なされない。
 */
const SUBMENU_OVERLAP = 2;

/**
 * サブメニューを親メニューの横に置く。右に収まらなければ親の左に反転し、縦は表示領域に収まるまで上へずらす。
 * `anchorTop` は、サブメニューの上端を揃えたい高さ(開いた項目の高さから、サブメニューの余白を引いたもの)。
 */
export function placeSubmenu(
	parent: { left: number; right: number },
	anchorTop: number,
	size: { width: number; height: number },
	viewport: { width: number; height: number },
): { left: number; top: number } {
	const rightEdge = parent.right - SUBMENU_OVERLAP;
	const left =
		rightEdge + size.width <= viewport.width
			? rightEdge
			: Math.max(0, parent.left + SUBMENU_OVERLAP - size.width);
	const top = Math.max(0, Math.min(anchorTop, viewport.height - size.height));
	return { left, top };
}

/**
 * Obsidian の Menu と同じ DOM とクラスで描くメニュー。見た目は Obsidian の CSS が担う。
 * このクラスは、開いたままにする項目、キーボードの移動、外側の押下、フォーカスの復元を自分で扱う。
 * 項目の `setSubmenu()` で、同じ作りのサブメニューを持てる。キーは根のメニューが一括で受け、一番奥のサブメニューへ渡す。
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
	private filter: MenuFilter | null = null;
	/**
	 * 絞り込みの欄があるメニューの、入力モードと選択モード(selection パレットと同じ考え方)。
	 * 入力モードは打った文字を絞り込みに使い、選択モードは欄を読み取り専用にして、1キーのアクセスキーを受ける。
	 * 欄のないメニューは、いつでも選択モード。
	 */
	private mode: "input" | "select" = "select";
	/** 選択中の項目。絞り込みでキーボードの対象の並びが変わっても、前の選択の表示を確実に外せるよう、添字とは別に持つ。 */
	private selectedItem: PaletteMenuItem | null = null;
	/** サブメニューなら、それを開いた親のメニューと、親の中でそれを持つ項目。根のメニューは両方 null。 */
	private parentMenu: PaletteMenu | null = null;
	private ownerItem: PaletteMenuItem | null = null;
	private currentSubmenu: PaletteMenu | null = null;
	private submenuTimer: number | null = null;
	/** 絞り込み中に、サブメニューの中身を親の一覧へ並べているときの、並べた先と、元の持ち主の記録。 */
	private flat: { el: HTMLElement; moved: { menu: PaletteMenu; nodes: ChildNode[] }[] } | null =
		null;

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
		inputEl.addEventListener("input", () => this.onFilterInput());
		// 欄をクリックしたら、打てるように入力モードへ戻る。
		inputEl.addEventListener("mousedown", () => this.setMode("input"));
		this.filter = { app, wrapEl, inputEl, emptyEl, minItems, active: false, scope: null };
		return this;
	}

	private onFilterInput(): void {
		const filter = this.filter;
		if (!filter) return;
		const { value } = filter.inputEl;
		// Why: IME が有効だと、スペースが全角スペースとして入力欄に入る。空白だけの入力は語ではないので、
		// 取り除く。残すと、以降のスペースが入力として扱われ、スイッチを切り替えられなくなる。
		if (value !== "" && value.trim() === "") {
			filter.inputEl.value = "";
			// 絞り込み中でなければ、選択を保つために何もしない。
			if (this.items.some((item) => item.isFiltered)) this.applyFilter();
			return;
		}
		this.applyFilter();
	}

	/** すべての操作をもう一度表示し、入力した語を消す。 */
	private resetFilter(): void {
		const filter = this.filter;
		if (!filter) return;
		// Why: サブメニューの中の操作も、絞り込みの欄を出すかどうかの数に含める。親の項目だけで数えると、操作を畳んだだけで欄が消える。
		filter.active = this.actionCount() >= filter.minItems;
		filter.wrapEl.toggleAttribute("hidden", !filter.active);
		filter.inputEl.value = "";
		this.applyFilter();
	}

	private applyFilter(): void {
		const filter = this.filter;
		if (!filter) return;
		const words = filter.inputEl.value.toLocaleLowerCase().split(/\s+/).filter(Boolean);
		const filtering = words.length > 0;
		// Why: 絞り込み中は、サブメニューの項目を親の一覧に並べる。入力で探す人が、どのサブメニューにあるかを知らなくても、
		// 畳まれた操作へ届くようにするため。サブメニューを開く項目そのものは、並べた項目と重複するので隠す。
		this.closeSubmenu();
		if (filtering) this.flatten();
		else this.unflatten();
		const items = [...this.items, ...this.descendantItems()];
		for (const item of items) {
			const searchText = `${item.title} ${item.searchTerms}`.toLocaleLowerCase();
			const missesWords =
				item.submenu !== null || !words.every((word) => searchText.includes(word));
			item.setFiltered(filtering && missesWords);
		}
		// Why: 両隣が消えると、グループの間の区切りは無関係な線に見えてしまう。
		for (const separator of this.scrollEl.querySelectorAll(".menu-separator"))
			separator.toggleClass("is-filtered", filtering);
		for (const group of this.scrollEl.querySelectorAll(".menu-group"))
			group.toggleClass("is-filtered", !group.querySelector(".menu-item:not(.is-filtered)"));
		filter.emptyEl.toggleClass(
			"is-visible",
			filtering && items.every((item) => item.isFiltered),
		);
		this.setSelected(-1);
		if (filtering) this.focusEnabled(0, 1);
	}

	/** サブメニューの中身を、親の一覧の末尾へ移す。移した先の `navItems()` に、その項目が加わる。 */
	private flatten(): void {
		if (this.flat) return;
		const el = this.scrollEl.createDiv("my-palette-menu-flat");
		const moved = this.descendantMenus().map((menu) => ({
			menu,
			nodes: [...menu.scrollEl.childNodes],
		}));
		for (const { nodes } of moved) el.append(...nodes);
		this.flat = { el, moved };
	}

	/** 並べたサブメニューの中身を、元のサブメニューへ戻す。絞り込みで付けた隠す印は、戻す前に外す。 */
	private unflatten(): void {
		if (!this.flat) return;
		const { el, moved } = this.flat;
		this.flat = null;
		for (const hidden of el.querySelectorAll(".is-filtered")) hidden.removeClass("is-filtered");
		for (const { menu, nodes } of moved) menu.scrollEl.append(...nodes);
		el.remove();
	}

	/** このメニューの下にあるすべてのサブメニュー。親を子より先にする。 */
	private descendantMenus(): PaletteMenu[] {
		return this.items.flatMap((item) =>
			item.submenu ? [item.submenu, ...item.submenu.descendantMenus()] : [],
		);
	}

	private descendantItems(): PaletteMenuItem[] {
		return this.descendantMenus().flatMap((menu) => menu.items);
	}

	/** サブメニューを開く項目を除いた、実行できる操作の数。 */
	private actionCount(): number {
		return [...this.items, ...this.descendantItems()].filter((item) => !item.submenu).length;
	}

	/**
	 * キーボードとポインターで選べる項目を、画面に並ぶ順に返す。絞り込み中は、親の一覧へ並べたサブメニューの項目が、
	 * 親の項目の後ろに続く。
	 */
	private navItems(): PaletteMenuItem[] {
		return this.flat ? [...this.items, ...this.descendantItems()] : this.items;
	}

	setParentElement(parentEl: HTMLElement): this {
		this.parentEl = parentEl;
		return this;
	}

	onHide(callback: () => void): void {
		this.hideCallback = callback;
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
		this.setMode(this.filter?.active ? "input" : "select");
		if (this.filter?.active) {
			this.filter.scope = new Scope();
			this.filter.app.keymap.pushScope(this.filter.scope);
			if (!doc.body.classList.contains("is-mobile"))
				this.filter.inputEl.focus({ preventScroll: true });
		}
		if (options.selectFirst) this.focusEnabled(0, 1);
	}

	hide(): void {
		// サブメニューは自分だけを閉じる。メニュー全体を閉じるのは、根のメニューの `hide()`。
		if (this.parentMenu) {
			if (this.parentMenu.currentSubmenu === this) this.parentMenu.closeSubmenu();
			return;
		}
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
		this.closeSubmenu();
		this.unflatten();
		doc.removeEventListener("mousedown", this.onOutsidePress, true);
		doc.removeEventListener("keydown", this.onKeyDown, true);
		win.removeEventListener("resize", this.onWindowChange);
		win.removeEventListener("blur", this.onWindowChange);
		this.openDoc = null;
		if (this.filter) this.filter.inputEl.readOnly = false;
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
		if (!this.isInside(event.target as Node)) this.hide();
	};

	/** メニューか、開いているサブメニューの中のノードかどうか。サブメニューは根のメニューの外の要素に描かれる。 */
	private isInside(node: Node): boolean {
		return this.dom.contains(node) || (this.currentSubmenu?.isInside(node) ?? false);
	}

	private readonly onWindowChange = (): void => this.hide();

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
		// Why: サブメニューが開いている間は、一番奥のサブメニューが先にキーを受ける。親のメニューの項目を、奥の操作と取り違えないため。
		const submenu = this.deepestSubmenu();
		if (submenu?.handleSubmenuKey(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		const typing = this.isTyping();
		if (!typing && !submenu && this.activateByAccessKey(event)) {
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		// 入力モードで絞り込みの欄に語が入っているとき、スペースは入力欄のものになる。
		// Why: 欄が空なら、スペースは選ばれた項目(スイッチ)を切り替える。語の区切りとして打つ必要がないため。
		if (typing && this.filter?.inputEl.value !== "" && isSpaceKey(event)) return;
		if (isSpaceKey(event)) {
			// Why: 何も選ばれていなくても、メニューが開いている間はスペースを背後の入力欄に渡さない。
			this.selectedItem?.activate(event);
			event.preventDefault();
			event.stopPropagation();
			return;
		}
		switch (event.key) {
			case "ArrowDown":
				this.enterSelectMode();
				this.focusEnabled(this.selected + 1, 1);
				break;
			case "ArrowUp":
				// 入力モードの上矢印は何もしない。選択モードで先頭の項目から押すと、入力モードへ戻る。
				if (typing) break;
				if (this.filter?.active && this.isAtFirstEnabled()) {
					this.setMode("input");
					break;
				}
				this.focusEnabled(
					this.selected < 0 ? this.navItems().length - 1 : this.selected - 1,
					-1,
				);
				break;
			case "ArrowRight": {
				// 入力モードの右矢印は、絞り込みの欄のカーソルを動かすので奪わない。
				const item = this.selectedItem;
				if (typing || !item?.submenu) return;
				this.openSubmenu(item, { selectFirst: true });
				break;
			}
			case "Home":
				this.enterSelectMode();
				this.focusEnabled(0, 1);
				break;
			case "End":
				this.enterSelectMode();
				this.focusEnabled(this.navItems().length - 1, -1);
				break;
			case "Enter":
				this.selectedItem?.activate(event);
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

	/**
	 * アクセスキーを押された項目を実行する。選択モードでだけ呼ぶ。
	 * 同じキーの項目が複数あるときは実行せず、押すたびに次の項目へカーソルを移す(最後の次は最初)。
	 */
	private activateByAccessKey(event: KeyboardEvent): boolean {
		const pressed = event.key.toLocaleUpperCase();
		const items = this.navItems();
		const matches = items.filter(
			(candidate) =>
				candidate.accessKey === pressed && !candidate.isDisabled && !candidate.isFiltered,
		);
		const [first] = matches;
		if (!first) return false;
		if (matches.length === 1) {
			first.activate(event);
			return true;
		}
		const current = matches.findIndex((candidate) => candidate === this.selectedItem);
		this.setSelected(items.indexOf(matches[(current + 1) % matches.length]));
		return true;
	}

	private setMode(mode: "input" | "select"): void {
		this.mode = mode;
		if (this.filter?.active) this.filter.inputEl.readOnly = mode === "select";
		this.showAccessKeys(mode === "select");
	}

	/** キーが効くのは選択モードだけなので、アクセスキーの表示もそのときだけにする。開いているサブメニューも同じにする。 */
	private showAccessKeys(visible: boolean): void {
		for (const item of this.items) item.setAccessKeyVisible(visible);
		this.currentSubmenu?.showAccessKeys(visible);
	}

	/** 絞り込みの欄に打っている最中かどうか。サブメニューは、根のメニューの状態で答える。 */
	private isTyping(): boolean {
		const root = this.rootMenu;
		return root.mode === "input" && root.filter?.active === true;
	}

	private enterSelectMode(): void {
		if (this.filter?.active && this.mode === "input") this.setMode("select");
	}

	/** 選択中の項目より前に、選べる項目がないかどうか。 */
	private isAtFirstEnabled(): boolean {
		return !this.navItems()
			.slice(0, Math.max(this.selected, 0))
			.some((item) => !item.isDisabled && !item.isFiltered);
	}

	private onPointerOver(event: PointerEvent): void {
		const items = this.navItems();
		const index = items.findIndex((item) => item.dom.contains(event.target as Node));
		if (index < 0) return;
		// Why: ポインターがサブメニューの中にあるなら、それを開いた親の項目の選択と、開いたままにすることを保つ。
		this.parentMenu?.holdSubmenu(this);
		const item = items[index];
		if (item.isDisabled) return;
		this.setSelected(index);
		this.scheduleSubmenu(item);
	}

	/** `start` から `direction` の向きに探し、最初の有効な項目を選ぶ。無効な項目は飛ばす。 */
	private focusEnabled(start: number, direction: 1 | -1): void {
		const items = this.navItems();
		const count = items.length;
		for (let step = 0; step < count; step++) {
			const index = (((start + direction * step) % count) + count) % count;
			if (!items[index].isDisabled && !items[index].isFiltered) {
				this.setSelected(index);
				return;
			}
		}
	}

	private setSelected(index: number): void {
		this.selectedItem?.dom.removeClass("selected");
		this.selected = index;
		this.selectedItem = this.navItems()[index] ?? null;
		if (this.selectedItem) {
			this.selectedItem.dom.addClass("selected");
			this.selectedItem.dom.scrollIntoView({ block: "nearest" });
		}
	}

	/** 根のメニュー。サブメニューなら、たどった一番上の親。 */
	get rootMenu(): PaletteMenu {
		return this.parentMenu ? this.parentMenu.rootMenu : this;
	}

	/** `owner` の項目が開くサブメニューを作る。使うのは `PaletteMenuItem.setSubmenu`。 */
	createSubmenu(owner: PaletteMenuItem): PaletteMenu {
		const submenu = new PaletteMenu();
		submenu.parentMenu = this;
		submenu.ownerItem = owner;
		return submenu;
	}

	/**
	 * 項目のサブメニューを、項目の横に開く。すでに別のサブメニューが開いていれば、先にそれを閉じる。
	 * `selectFirst` なら、キーボードで続けて選べるよう、最初の有効な項目を選ぶ。
	 */
	openSubmenu(item: PaletteMenuItem, options: { selectFirst?: boolean } = {}): void {
		this.cancelSubmenuTimer();
		const submenu = item.submenu;
		if (!submenu || item.isDisabled || submenu.items.length === 0) return;
		if (this.currentSubmenu !== submenu) {
			this.closeSubmenu();
			this.currentSubmenu = submenu;
			submenu.showBeside(this, item);
			item.setExpanded(true);
		}
		// Why: アクセスキーや Enter で開いたときも、開いた項目を選んでおく。そうしないと、← で閉じたときに戻る先がずれる。
		const index = this.navItems().indexOf(item);
		if (index >= 0 && this.selectedItem !== item) this.setSelected(index);
		if (options.selectFirst) submenu.focusEnabled(0, 1);
	}

	/** 開いているサブメニューを、その奥のものも含めて閉じる。 */
	closeSubmenu(): void {
		this.cancelSubmenuTimer();
		const submenu = this.currentSubmenu;
		if (!submenu) return;
		this.currentSubmenu = null;
		submenu.closeSubmenu();
		submenu.setSelected(-1);
		submenu.dom.remove();
		submenu.ownerItem?.setExpanded(false);
	}

	/** 親のメニューの横に、持ち主の項目の高さに揃えて置く。 */
	private showBeside(parent: PaletteMenu, owner: PaletteMenuItem): void {
		const doc = parent.dom.ownerDocument;
		doc.body.appendChild(this.dom);
		this.showAccessKeys(!this.isTyping());
		// Why: 最初の項目をサブメニューの上端ではなく、持ち主の項目に揃える。メニューの余白と枠の分だけ、上へずらす。
		const firstItemTop = this.items[0].dom.getBoundingClientRect().top;
		const padding = firstItemTop - this.dom.getBoundingClientRect().top;
		const parentRect = parent.dom.getBoundingClientRect();
		const { left, top } = placeSubmenu(
			parentRect,
			owner.dom.getBoundingClientRect().top - padding,
			{ width: this.dom.offsetWidth, height: this.dom.offsetHeight },
			{ width: doc.documentElement.clientWidth, height: doc.documentElement.clientHeight },
		);
		this.dom.style.left = `${left}px`;
		this.dom.style.top = `${top}px`;
	}

	/** 一番奥の、開いているサブメニュー。開いているものがなければ null。 */
	private deepestSubmenu(): PaletteMenu | null {
		let deepest: PaletteMenu | null = null;
		for (let menu = this.currentSubmenu; menu; menu = menu.currentSubmenu) deepest = menu;
		return deepest;
	}

	/**
	 * 根のメニューから渡された、一番奥のサブメニューへのキーを扱う。扱えたら true。
	 * サブメニューは、キーボードの移動、←(Esc)で1段閉じる、→で奥のサブメニューを開く、実行までを受け持つ。
	 */
	private handleSubmenuKey(event: KeyboardEvent): boolean {
		const root = this.rootMenu;
		switch (event.key) {
			case "ArrowDown":
				root.enterSelectMode();
				this.focusEnabled(this.selected + 1, 1);
				return true;
			case "ArrowUp":
				root.enterSelectMode();
				this.focusEnabled(
					this.selected < 0 ? this.items.length - 1 : this.selected - 1,
					-1,
				);
				return true;
			case "Home":
				root.enterSelectMode();
				this.focusEnabled(0, 1);
				return true;
			case "End":
				root.enterSelectMode();
				this.focusEnabled(this.items.length - 1, -1);
				return true;
			case "ArrowRight":
				// 開けない項目でも受ける。背後の入力欄のカーソルを動かしたくないため。
				if (this.selectedItem?.submenu)
					this.openSubmenu(this.selectedItem, { selectFirst: true });
				return true;
			case "ArrowLeft":
			case "Escape":
				this.parentMenu?.closeSubmenu();
				return true;
			case "Enter":
				this.selectedItem?.activate(event);
				return true;
		}
		if (isSpaceKey(event)) {
			this.selectedItem?.activate(event);
			return true;
		}
		// Why: 絞り込みの欄に打っている間は、文字はその欄のもの。アクセスキーとして奪わない。
		return !this.isTyping() && this.activateByAccessKey(event);
	}

	/** ポインターが項目に乗ったとき、その項目のサブメニューを待ち時間のあとで開く。別の項目なら、開いているサブメニューを閉じる。 */
	private scheduleSubmenu(item: PaletteMenuItem): void {
		this.cancelSubmenuTimer();
		if (item.submenu === this.currentSubmenu) return;
		const win = this.dom.ownerDocument.defaultView ?? window;
		this.submenuTimer = win.setTimeout(() => {
			this.submenuTimer = null;
			if (item.submenu) this.openSubmenu(item);
			else this.closeSubmenu();
		}, SUBMENU_DELAY_MS);
	}

	private cancelSubmenuTimer(): void {
		if (this.submenuTimer === null) return;
		(this.dom.ownerDocument.defaultView ?? window).clearTimeout(this.submenuTimer);
		this.submenuTimer = null;
	}

	/** ポインターがサブメニューの中へ入った。それを開いた項目を選んだままにし、閉じる予約を取り消す。 */
	private holdSubmenu(submenu: PaletteMenu): void {
		this.cancelSubmenuTimer();
		this.parentMenu?.holdSubmenu(this);
		const index = submenu.ownerItem ? this.navItems().indexOf(submenu.ownerItem) : -1;
		if (index >= 0) this.setSelected(index);
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
	private child: PaletteMenu | null = null;
	private callback: ((event: PaletteMenuActivation) => void) | null = null;
	private searchText = "";
	private baseTitle = "";
	accessKey: string | undefined;
	private accessKeyVisible = true;

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
		// Why: 絞り込みがアクセスキーの表示 "(O)" に一致しないよう、表示名だけを返す。
		return this.baseTitle;
	}

	get searchTerms(): string {
		return this.searchText;
	}

	/** 表示名以外に絞り込みで使う語(操作 ID など)を設定する。 */
	setSearchTerms(...terms: string[]): this {
		this.searchText = terms.join(" ").toLocaleLowerCase();
		return this;
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
		this.baseTitle = title;
		this.renderTitle();
		return this;
	}

	/** ブラウザーのコンテキストメニューのように、項目名の後ろへアクセスキーを表示する。 */
	setAccessKey(key: string): this {
		this.accessKey = key.toLocaleUpperCase();
		this.renderTitle();
		return this;
	}

	setAccessKeyVisible(visible: boolean): void {
		this.accessKeyVisible = visible;
		this.renderTitle();
	}

	private renderTitle(): void {
		const hint = this.accessKey && this.accessKeyVisible ? ` (${this.accessKey})` : "";
		this.titleEl.setText(`${this.baseTitle}${hint}`);
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
		setTooltip(this.dom, text);
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

	/** この項目を有効にした後もメニューを開いたままにする。例: スイッチの切り替え。 */
	setKeepOpen(keepOpen = true): this {
		this.keepOpen = keepOpen;
		return this;
	}

	/** この項目が開くサブメニュー。なければ null。 */
	get submenu(): PaletteMenu | null {
		return this.child;
	}

	/**
	 * この項目を、サブメニューを開く項目にして、そのサブメニューを返す。Obsidian の Menu と同じく、右端に矢印を出す。
	 * サブメニューを持つ項目は、`onClick` を呼ばない。有効にすると、サブメニューを開く。
	 */
	setSubmenu(): PaletteMenu {
		if (this.child) return this.child;
		this.child = this.menu.createSubmenu(this);
		this.dom.addClass("has-submenu");
		this.dom.setAttribute("aria-haspopup", "menu");
		this.setExpanded(false);
		setIcon(this.dom.createDiv("menu-item-icon mod-submenu"), ICONS.expand);
		return this.child;
	}

	/** サブメニューが開いているかどうかを、支援技術に伝える。 */
	setExpanded(expanded: boolean): void {
		this.dom.setAttribute("aria-expanded", String(expanded));
	}

	onClick(callback: (event: PaletteMenuActivation) => void): this {
		this.callback = callback;
		return this;
	}

	/** クリックまたはキーボードで有効にしたときに呼ぶ。無効な項目では何もしない。 */
	activate(event: PaletteMenuActivation): void {
		if (this.disabled) return;
		if (this.child) {
			// Why: キーボードで開いたときだけ最初の項目を選ぶ。クリックでは、ポインターが選ぶ項目を決める。
			this.menu.openSubmenu(this, { selectFirst: event.type === "keydown" });
			return;
		}
		this.callback?.(event);
		// Why: サブメニューの項目を実行しても、閉じるのは根のメニュー全体。
		if (!this.keepOpen) this.menu.rootMenu.hide();
	}
}
