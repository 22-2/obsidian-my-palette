import type { App as ObsidianApp } from "obsidian";

export class App {}

interface ElementOptions {
	cls?: string;
	text?: string;
	attr?: Record<string, string>;
}

// Obsidian固有のDOM拡張だけを補い、イベントの伝播と選択は実際のDOMで検証する。
export function installObsidianDom(): void {
	const create = function (
		this: HTMLElement,
		tag: string,
		options: string | ElementOptions = {},
	): HTMLElement {
		const element = document.createElement(tag);
		const props = typeof options === "string" ? { cls: options } : options;
		if (props.cls) element.className = props.cls;
		if (props.text) element.textContent = props.text;
		for (const [key, value] of Object.entries(props.attr ?? {}))
			element.setAttribute(key, value);
		this.append(element);
		return element;
	};
	Object.defineProperties(HTMLElement.prototype, {
		instanceOf: {
			configurable: true,
			value(this: HTMLElement, type: { name: string }) {
				// Match Obsidian's cross-window check using the node's owning realm.
				const realm = this.ownerDocument.defaultView;
				const constructor = type.name === "Node" ? realm?.Node : realm?.Element;
				return !!constructor && this instanceof constructor;
			},
		},
		createEl: { configurable: true, value: create },
		createDiv: {
			configurable: true,
			value(this: HTMLElement, options?: string | ElementOptions) {
				return create.call(this, "div", options);
			},
		},
		createSpan: {
			configurable: true,
			value(this: HTMLElement, options?: string | ElementOptions) {
				return create.call(this, "span", options);
			},
		},
		empty: {
			configurable: true,
			value(this: HTMLElement) {
				this.replaceChildren();
			},
		},
		addClass: {
			configurable: true,
			value(this: HTMLElement, ...names: string[]) {
				this.classList.add(...names);
			},
		},
		removeClass: {
			configurable: true,
			value(this: HTMLElement, ...names: string[]) {
				this.classList.remove(...names);
			},
		},
		toggleClass: {
			configurable: true,
			value(this: HTMLElement, name: string, enabled: boolean) {
				this.classList.toggle(name, enabled);
			},
		},
		setText: {
			configurable: true,
			value(this: HTMLElement, text: string) {
				this.textContent = text;
			},
		},
		scrollIntoView: { configurable: true, value() {} },
	});
}

export class Component {
	private loaded = false;
	private cleanups: (() => void)[] = [];
	onload(): void {}
	load(): void {
		if (this.loaded) return;
		this.loaded = true;
		this.onload();
	}
	unload(): void {
		this.loaded = false;
		for (const cleanup of this.cleanups.splice(0)) cleanup();
	}
	registerDomEvent(
		el: HTMLElement,
		type: string,
		callback: EventListener,
		options?: boolean | AddEventListenerOptions,
	): void {
		el.addEventListener(type, callback, options);
		this.cleanups.push(() => el.removeEventListener(type, callback, options));
	}
}

export class Modal {
	readonly modalEl = document.createElement("div");
	readonly scope = {
		keys: ["Home", "End", "Escape"].map((key) => ({
			key,
			modifiers: "",
			func: (_event: KeyboardEvent): false | undefined => undefined,
		})),
		unregister: (handler: unknown) => {
			this.scope.keys = this.scope.keys.filter((entry) => entry !== handler);
		},
		register: (
			modifiers: string[],
			key: string,
			func: (event: KeyboardEvent) => false | undefined,
		) => {
			this.scope.keys.push({ key, modifiers: modifiers.join("+"), func });
		},
	};
	constructor(public app: ObsidianApp) {}
	onOpen(): void {}
	onClose(): void {}
	open(): void {
		document.body.append(this.modalEl);
		this.onOpen();
	}
	close(): void {
		this.onClose();
		this.modalEl.remove();
	}
}

export function setIcon(): void {}

interface MenuEntry {
	title: string;
	icon?: string;
	checked?: boolean;
	disabled?: boolean;
	click: () => void;
}

/** Records the items of the last shown menu so tests can assert on their content. */
export class Menu {
	static last?: Menu;
	/** Alias of `last`, kept for tests written against the earlier double. */
	static lastShown?: Menu;
	readonly items: MenuEntry[] = [];
	separators = 0;
	shown = false;
	closed = false;
	private hideHandlers: (() => void)[] = [];
	addItem(build: (item: Record<string, unknown>) => unknown): this {
		const entry: MenuEntry = { title: "", click: () => undefined };
		const item = {
			setTitle: (title: string) => ((entry.title = title), item),
			setIcon: (icon: string) => ((entry.icon = icon), item),
			setChecked: (checked: boolean) => ((entry.checked = checked), item),
			setDisabled: (disabled: boolean) => ((entry.disabled = disabled), item),
			onClick: (click: () => void) => ((entry.click = click), item),
		};
		build(item);
		this.items.push(entry);
		return this;
	}
	addSeparator(): this {
		this.separators += 1;
		return this;
	}
	setParentElement(): this {
		return this;
	}
	onHide(handler: () => void): void {
		this.hideHandlers.push(handler);
	}
	showAtMouseEvent(): void {
		this.shown = true;
		Menu.last = this;
		Menu.lastShown = this;
	}
	showAtPosition(): void {
		this.shown = true;
		Menu.last = this;
		Menu.lastShown = this;
	}
	close(): void {
		this.closed = true;
		for (const handler of this.hideHandlers) handler();
	}
	titles(): string[] {
		return this.items.map(({ title }) => title);
	}
}
