import { Scope, setIcon, type App, type IconName } from "obsidian";
import { ICONS } from "src/ui/icons";

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

/** An action that is hard to undo, run only on a second press. */
export interface ConfirmedMenuItemOptions {
	title: string;
	/** Shown after the first press, e.g. "Click again to clear". */
	confirmTitle: string;
	icon: IconName;
	tooltip?: string;
	/** Red, for actions that destroy something. Defaults to true. */
	warning?: boolean;
	run: () => void;
}

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
	private selectionListener: ((item: PaletteMenuItem | undefined) => void) | null = null;
	private filter: MenuFilter | null = null;

	constructor() {
		this.dom = createDiv();
		this.dom.className = "menu";
		this.dom.setAttribute("role", "menu");
		this.scrollEl = this.dom.createDiv("menu-scroll");
		// Why: a press on the menu must not move focus away from the palette input.
		// The filter input is the one place in the menu that must take focus.
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
	 * The first press turns the item into a confirmation that keeps the menu open, and the
	 * second press runs it and closes the menu. Moving to another item cancels the confirmation,
	 * so a later press starts over. A menu holds at most one such item.
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
				// Why: the first press kept the menu open; leaving that on would keep it open now.
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
	 * Adds a quiet label that names the items after it. It is not an item, so the keyboard and
	 * the filter pass over it, and it never reads as a command that is turned off.
	 */
	addHeading(title: string): this {
		if (!this.group) this.group = this.scrollEl.createDiv("menu-group");
		this.group.createDiv({ cls: "my-palette-menu-heading", text: title });
		return this;
	}

	addSeparator(): this {
		// Why: a separator with no item before it, or right after another one, would show as a stray line.
		if (!this.group) return this;
		this.scrollEl.createDiv("menu-separator").setAttribute("role", "separator");
		this.group = null;
		return this;
	}

	/**
	 * Adds a text field above the actions. While the menu is open, typing narrows the list to the
	 * actions whose title contains every typed word, instead of reaching the palette behind it.
	 * A menu with fewer than `minItems` actions skips the field, since there is nothing to narrow.
	 */
	enableFilter(app: App, minItems = 5): this {
		if (this.filter) return this;
		const wrapEl = createDiv("my-palette-menu-filter");
		const inputEl = wrapEl.createEl("input", {
			cls: "my-palette-menu-filter__input",
			attr: { type: "text", placeholder: "Filter actions…", "aria-label": "Filter actions" },
		});
		this.dom.insertBefore(wrapEl, this.scrollEl);
		const emptyEl = this.scrollEl.createDiv({
			cls: "my-palette-menu-empty",
			text: "No matching actions",
		});
		inputEl.addEventListener("input", () => this.applyFilter());
		this.filter = { app, wrapEl, inputEl, emptyEl, minItems, active: false, scope: null };
		return this;
	}

	/** Shows every action again and clears the typed words. */
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
		// Why: a separator between groups reads as a stray line once its neighbours are gone.
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

	/** Calls back whenever the selection moves, with the newly selected item or undefined. */
	onSelectionChange(listener: (item: PaletteMenuItem | undefined) => void): this {
		this.selectionListener = listener;
		return this;
	}

	showAtMouseEvent(event: MouseEvent, options: Omit<PaletteMenuShowOptions, "doc"> = {}): void {
		this.showAtPosition({ x: event.clientX, y: event.clientY }, { ...options, doc: event.doc });
	}

	showAtPosition(position: PaletteMenuPosition, options: PaletteMenuShowOptions = {}): void {
		// Why: reopening replaces the open menu without a hide, so onHide stays registered for the next close.
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

		// Why: the capture phase sees a press on the palette's own rows before they act on it,
		// so the menu closes for any outside press without each row having to close it.
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

	/** Same as `hide()`, under the name Obsidian's Menu uses. */
	close(): void {
		this.hide();
	}

	/** Removes the open menu and its listeners. It does not call `onHide`, so a reopen can reuse this. */
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
		// Why: focus goes back only when nothing else took it, so a click on another input keeps its focus.
		if (restore?.isConnected && (doc.activeElement === null || doc.activeElement === doc.body))
			restore.focus();
	}

	private readonly onOutsidePress = (event: MouseEvent): void => {
		if (!this.dom.contains(event.target as Node)) this.hide();
	};

	private readonly onWindowChange = (): void => this.hide();

	private readonly onKeyDown = (event: KeyboardEvent): void => {
		if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
		// With the filter open, Space and the cursor keys belong to the text field.
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
	 * Pushed while the menu is open. A modal's scope pulls focus back from any element outside
	 * the modal, so without its own scope the filter field could never keep focus.
	 */
	scope: Scope | null;
	wrapEl: HTMLElement;
	inputEl: HTMLInputElement;
	emptyEl: HTMLElement;
	minItems: number;
	/** Whether the field is shown for the open menu, which depends on how many actions it has. */
	active: boolean;
}

/** A menu item. Appearance setters take effect even while the menu is open. */
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

	/** Whether the menu's filter currently hides this item. */
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
	 * Shows the item as an on/off switch. Unlike setChecked, the switch is drawn in both states,
	 * so an option that is off still reads as something that can be turned on.
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

	/** Explains the item in a tooltip, for labels that cannot say everything. */
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

	/** Marks the item as the main action of a confirmation. With setWarning, it shows as a red call to action. */
	setCta(cta = true): this {
		this.dom.toggleClass("mod-cta", cta);
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
