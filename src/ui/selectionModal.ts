import { App, Modal, setIcon } from "obsidian";
import { microFuzzy } from "src/core/strings";

export interface SelectionItem {
	label: string;
	description?: string;
	icon?: string;
	badge?: string;
	value?: unknown;
}

interface ModalProps<T> {
	title: string;
	items?: T[];
	placeholder?: string;
	defaultValue?: T;
}

/**
 * キーボード主体の選択 UI を提供するモーダル基盤。
 *
 * PaletteModal はこのクラスを継承し、検索とアクションだけを実装する。
 * 単純な選択 UI は showSelectionModal からそのまま利用できる。
 */
export class SelectionModal<T> extends Modal {
	selected: T | null = null;
	protected items: T[];
	protected selectedIndex = 0;
	protected inputEl!: HTMLInputElement;
	protected resultsEl!: HTMLElement;
	protected headingEl!: HTMLElement;
	protected titleIconEl!: HTMLElement;
	protected statusEl!: HTMLElement;
	protected spinnerEl!: HTMLElement;
	protected actionButton!: HTMLButtonElement;
	private resolveClose?: (item: T | null) => void;
	private readonly placeholder: string;
	private title: string;

	constructor(
		{ title, items = [], defaultValue, placeholder = "Search…" }: ModalProps<T>,
		app: App,
	) {
		super(app);
		this.title = title;
		this.items = [...items];
		this.selected = defaultValue ?? null;
		this.placeholder = placeholder;
	}

	onOpen(): void {
		this.modalEl.addClass("selection-modal");
		this.contentEl.empty();

		const header = this.contentEl.createDiv("selection-modal__header");
		this.titleIconEl = header.createSpan("selection-modal__title-icon");
		this.headingEl = header.createDiv({ cls: "selection-modal__title", text: this.title });
		this.spinnerEl = header.createSpan("selection-modal__spinner");
		setIcon(this.spinnerEl, "loader-circle");
		this.spinnerEl.setAttribute("aria-hidden", "true");

		this.inputEl = this.contentEl.createEl("input", {
			type: "text",
			cls: "selection-modal__input",
			attr: {
				placeholder: this.placeholder,
				autocomplete: "off",
				spellcheck: "false",
				role: "combobox",
				"aria-expanded": "true",
				"aria-controls": "selection-modal-results",
			},
		});
		this.resultsEl = this.contentEl.createDiv("selection-modal__results");
		this.resultsEl.id = "selection-modal-results";
		this.resultsEl.setAttribute("role", "listbox");

		const footer = this.contentEl.createDiv("selection-modal__footer");
		this.statusEl = footer.createDiv("selection-modal__status");
		this.actionButton = footer.createEl("button", {
			cls: "selection-modal__action-button",
			text: "Open settings",
		});
		this.actionButton.hide();
		footer.createDiv({
			cls: "selection-modal__hint",
			text: "↑↓ navigate · Enter select · Esc close",
		});

		this.inputEl.addEventListener("input", () => this.onQueryChanged(this.inputEl.value));
		this.inputEl.addEventListener("keydown", (event) => this.handleKeydown(event));
		this.renderItems();
		this.setStatus(this.items.length ? `${this.items.length} results` : "No results");
		this.onSelectionModalOpen();
		window.setTimeout(() => this.inputEl.focus(), 0);
	}

	onClose(): void {
		this.onSelectionModalClose();
		this.resolveClose?.(this.selected);
		this.resolveClose = undefined;
		this.contentEl.empty();
	}

	open(): Promise<T | null> {
		super.open();
		return new Promise<T | null>((resolve) => {
			this.resolveClose = resolve;
		});
	}

	protected onSelectionModalOpen(): void {}
	protected onSelectionModalClose(): void {}

	protected onQueryChanged(query: string): void {
		this.setItems(this.getSuggestions(query));
		this.setStatus(this.items.length ? `${this.items.length} results` : "No results");
	}

	protected getSuggestions(query: string): T[] {
		if (!query.trim()) return this.items;
		const normalized = query.toLocaleLowerCase();
		return this.items
			.map((item) => ({
				item,
				score: microFuzzy(this.toSelectionItem(item).label.toLocaleLowerCase(), normalized)
					.score,
			}))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item);
	}

	protected toSelectionItem(item: T): SelectionItem {
		if (typeof item === "string") return { label: item };
		return item as unknown as SelectionItem;
	}

	protected async onItemActivated(item: T, _event: Event): Promise<void> {
		this.selected = item;
		this.close();
	}

	protected handleKeydown(event: KeyboardEvent): void {
		if (event.isComposing) return;
		if (event.key === "Escape") {
			event.preventDefault();
			this.close();
			return;
		}
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			this.moveSelection(event.key === "ArrowDown" ? 1 : -1);
			return;
		}
		if (event.key === "Enter") {
			event.preventDefault();
			void this.activateSelected(event);
		}
	}

	protected moveSelection(delta: number): void {
		if (!this.items.length) return;
		this.selectedIndex = (this.selectedIndex + delta + this.items.length) % this.items.length;
		this.renderItems();
	}

	protected async activateSelected(event: Event): Promise<void> {
		const item = this.items[this.selectedIndex];
		if (item !== undefined) await this.onItemActivated(item, event);
	}

	protected setItems(items: T[]): void {
		this.items = items;
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, items.length - 1));
		this.renderItems();
	}

	protected setLoading(loading: boolean): void {
		this.spinnerEl?.toggleClass("is-visible", loading);
		this.inputEl?.setAttribute("aria-busy", String(loading));
	}

	protected setHeading(title: string, icon?: string): void {
		this.title = title;
		this.headingEl?.setText(title);
		if (icon && this.titleIconEl) setIcon(this.titleIconEl, icon);
	}

	protected setStatus(text: string): void {
		this.statusEl?.setText(text);
	}

	protected setActionButton(visible: boolean, onClick?: () => void): void {
		if (onClick) this.actionButton.onclick = onClick;
		if (visible) this.actionButton.show();
		else this.actionButton.hide();
	}

	private renderItems(): void {
		if (!this.resultsEl) return;
		this.resultsEl.empty();
		this.items.forEach((item, index) => {
			const result = this.toSelectionItem(item);
			const id = `selection-modal-result-${index}`;
			const row = this.resultsEl.createDiv({
				cls: "selection-modal__result",
				attr: { id, role: "option", "aria-selected": String(index === this.selectedIndex) },
			});
			if (index === this.selectedIndex) row.addClass("is-selected");
			if (result.icon) {
				const icon = row.createSpan("selection-modal__result-icon");
				setIcon(icon, result.icon);
			}
			const copy = row.createDiv("selection-modal__result-copy");
			copy.createDiv({ cls: "selection-modal__result-label", text: result.label });
			if (result.description)
				copy.createDiv({
					cls: "selection-modal__result-description",
					text: result.description,
				});
			if (result.badge)
				row.createDiv({ cls: "selection-modal__result-badge", text: result.badge });
			row.addEventListener("mousemove", () => {
				if (this.selectedIndex !== index) {
					this.selectedIndex = index;
					this.renderItems();
				}
			});
			row.addEventListener("click", (event) => void this.onItemActivated(item, event));
		});
		const active = this.items[this.selectedIndex];
		if (active !== undefined) {
			this.inputEl?.setAttribute(
				"aria-activedescendant",
				`selection-modal-result-${this.selectedIndex}`,
			);
			this.resultsEl.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
		} else this.inputEl?.removeAttribute("aria-activedescendant");
	}
}

export async function showSelectionModal<T extends string | SelectionItem>(
	props: ModalProps<T>,
	app: App,
): Promise<T | null> {
	return new SelectionModal(props, app).open();
}
