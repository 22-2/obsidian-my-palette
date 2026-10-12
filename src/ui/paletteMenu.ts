import { setIcon, type IconName } from "obsidian";

export interface PaletteMenuPosition {
	x: number;
	y: number;
}

export interface PaletteMenuShowOptions {
	/** Document to show the menu in. Defaults to the parent element's document, then the current one. */
	doc?: Document;
	/** Open with the first enabled item selected (used when opened from the keyboard). */
	selectFirst?: boolean;
}

export type PaletteMenuActivation = MouseEvent | KeyboardEvent;

const GAP = 2;

/**
 * Places the menu at the pointer, and flips it to the other side when it would leave the viewport.
 * Like Obsidian's Menu, a menu overflowing the right or bottom edge moves to the left or top of the pointer.
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
 * A menu drawn with the same DOM and classes as Obsidian's Menu.
 * Obsidian's CSS provides the look; this class handles keep-open items, keyboard navigation,
 * outside presses, and focus restoration itself.
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

	constructor() {
		this.dom = document.createElement("div");
		this.dom.className = "menu";
		this.scrollEl = this.dom.createDiv("menu-scroll");
		// Why: a press on the menu must not move focus away from the palette input.
		this.dom.addEventListener("mousedown", (event) => {
			if (event.button === 0) event.preventDefault();
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

	addSeparator(): this {
		// Why: a separator with no item before it, or right after another one, would show as a stray line.
		if (!this.group) return this;
		this.scrollEl.createDiv("menu-separator");
		this.group = null;
		return this;
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
		this.hide();
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

		// Why: the capture phase sees a press on the palette's own rows before they act on it,
		// so the menu closes for any outside press without each row having to close it.
		doc.addEventListener("mousedown", this.onOutsidePress, true);
		doc.addEventListener("keydown", this.onKeyDown, true);
		win.addEventListener("resize", this.onWindowChange);
		win.addEventListener("blur", this.onWindowChange);

		if (options.selectFirst) this.focusEnabled(0, 1);
	}

	hide(): void {
		const doc = this.openDoc;
		if (!doc) return;
		const win = doc.defaultView ?? window;
		doc.removeEventListener("mousedown", this.onOutsidePress, true);
		doc.removeEventListener("keydown", this.onKeyDown, true);
		win.removeEventListener("resize", this.onWindowChange);
		win.removeEventListener("blur", this.onWindowChange);
		this.openDoc = null;
		this.setSelected(-1);
		this.parentEl?.removeClass("has-active-menu");
		this.dom.remove();

		const restore = this.restoreFocusTo;
		this.restoreFocusTo = null;
		// Why: focus goes back only when nothing else took it, so a click on another input keeps its focus.
		if (restore?.isConnected && (doc.activeElement === null || doc.activeElement === doc.body))
			restore.focus();

		const callback = this.hideCallback;
		this.hideCallback = null;
		callback?.();
	}

	private readonly onOutsidePress = (event: MouseEvent): void => {
		if (!this.dom.contains(event.target as Node)) this.hide();
	};

	private readonly onWindowChange = (): void => this.hide();

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
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
		// Why: the menu takes its keys here, so Escape and Enter never reach the palette behind it.
		event.preventDefault();
		event.stopPropagation();
	};

	private onPointerOver(event: PointerEvent): void {
		const index = this.items.findIndex((item) => item.dom.contains(event.target as Node));
		if (index >= 0 && !this.items[index].isDisabled) this.setSelected(index);
	}

	/** Selects the first enabled item, searching from `start` in `direction` and skipping disabled items. */
	private focusEnabled(start: number, direction: 1 | -1): void {
		const count = this.items.length;
		for (let step = 0; step < count; step++) {
			const index = (((start + direction * step) % count) + count) % count;
			if (!this.items[index].isDisabled) {
				this.setSelected(index);
				return;
			}
		}
	}

	private setSelected(index: number): void {
		this.items[this.selected]?.dom.removeClass("selected");
		this.selected = index;
		const item = this.items[index];
		if (!item) return;
		item.dom.addClass("selected");
		item.dom.scrollIntoView({ block: "nearest" });
	}
}

/** A menu item. Appearance setters take effect even while the menu is open. */
export class PaletteMenuItem {
	readonly dom: HTMLElement;
	private readonly menu: PaletteMenu;
	private readonly iconEl: HTMLElement;
	private readonly titleEl: HTMLElement;
	private checkIconEl: HTMLElement | null = null;
	private disabled = false;
	private keepOpen = false;
	private callback: ((event: PaletteMenuActivation) => void) | null = null;

	constructor(menu: PaletteMenu) {
		this.menu = menu;
		this.dom = document.createElement("div");
		this.dom.className = "menu-item tappable";
		this.iconEl = this.dom.createDiv("menu-item-icon");
		this.titleEl = this.dom.createDiv("menu-item-title");
		this.dom.addEventListener("click", (event) => this.activate(event));
	}

	get isDisabled(): boolean {
		return this.disabled;
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
			setIcon(this.checkIconEl, "check");
		} else if (!checked && this.checkIconEl) {
			this.checkIconEl.remove();
			this.checkIconEl = null;
		}
		this.dom.toggleClass("mod-checked", checked);
		return this;
	}

	setDisabled(disabled: boolean): this {
		this.disabled = disabled;
		this.dom.toggleClass("is-disabled", disabled);
		return this;
	}

	setWarning(warning: boolean): this {
		this.dom.toggleClass("is-warning", warning);
		return this;
	}

	/** Keeps the menu open after this item is activated, e.g. for a click-again confirmation. */
	setKeepOpen(keepOpen = true): this {
		this.keepOpen = keepOpen;
		return this;
	}

	onClick(callback: (event: PaletteMenuActivation) => void): this {
		this.callback = callback;
		return this;
	}

	/** Called on click or keyboard activation. Does nothing for a disabled item. */
	activate(event: PaletteMenuActivation): void {
		if (this.disabled) return;
		this.callback?.(event);
		if (!this.keepOpen) this.menu.hide();
	}
}
