import { App, SuggestModal, setIcon } from "obsidian";
import fuzzysort from "fuzzysort";

export interface SelectionItem {
	label: string;
	description?: string;
	icon?: string;
	badge?: string;
	value?: unknown;
}

interface ModalProps<T> {
	title?: string;
	items?: T[];
	placeholder?: string;
	defaultValue?: T;
	initialInput?: string;
	footerText?: string;
}

/**
 * Obsidian 標準の SuggestModal をそのまま利用する選択 UI。
 * 候補の表示内容だけを拡張し、モーダル枠・入力欄・キーボード操作は Obsidian に委ねる。
 */
export class SelectionModal<T> extends SuggestModal<T> {
	protected items: T[];
	selected: T | null;
	private query = "";
	private resultCountEl?: HTMLElement;
	private statusTextEl?: HTMLElement;
	private readonly footerText?: string;
	private readonly initialInput: string;

	constructor(
		{
			items = [],
			defaultValue,
			placeholder = "Search…",
			initialInput = "",
			footerText,
		}: ModalProps<T>,
		app: App,
	) {
		super(app);
		this.items = [...items];
		this.selected = defaultValue ?? null;
		this.initialInput = initialInput;
		this.footerText = footerText;
		this.inputEl.value = initialInput;
		this.limit = 50;
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("my-palette-suggest-modal");
		const statusBar = this.modalEl.createDiv("my-palette-status-bar");
		this.statusTextEl = statusBar.createSpan({
			cls: "my-palette-status-bar__text",
			text: this.footerText ?? "",
		});
		this.resultCountEl = statusBar.createSpan("my-palette-status-bar__count");
		this.updateResultCount(0);
		this.onSelectionModalOpen();
		if (this.initialInput) {
			this.inputEl.value = this.initialInput;
			window.setTimeout(() => {
				if (!this.inputEl.isConnected) return;
				this.refreshSuggestions();
			}, 0);
		}
	}

	onClose(): void {
		this.onSelectionModalClose();
		super.onClose();
	}

	getSuggestions(query: string): T[] | Promise<T[]> {
		this.query = query;
		if (!query.trim()) {
			this.updateResultCount(this.items.length);
			return this.items;
		}
		const results = fuzzysort.go(query, this.items, {
			key: (item) => this.toSelectionItem(item).label,
		});
		this.updateResultCount(results.total);
		return results.map(({ obj }) => obj);
	}

	renderSuggestion(item: T, el: HTMLElement): void {
		const result = this.toSelectionItem(item);
		const row = el.createDiv("my-palette-suggestion");
		if (result.icon) {
			const icon = row.createSpan("my-palette-suggestion__icon");
			setIcon(icon, result.icon);
		}
		const label = row.createSpan("my-palette-suggestion__label");
		this.renderMatchedLabel(label, result.label);
		if (result.description)
			row.createSpan({
				cls: "my-palette-suggestion__description",
				text: result.description,
			});
		if (result.badge)
			row.createSpan({ cls: "my-palette-suggestion__badge", text: result.badge });
	}

	onChooseSuggestion(item: T, event: MouseEvent | KeyboardEvent): void {
		this.selected = item;
		void this.onItemActivated(item, event);
	}

	protected onSelectionModalOpen(): void {}
	protected onSelectionModalClose(): void {}

	protected toSelectionItem(item: T): SelectionItem {
		if (typeof item === "string") return { label: item };
		return item as unknown as SelectionItem;
	}

	protected async onItemActivated(item: T, _event: Event): Promise<void> {
		this.selected = item;
		this.close();
	}

	protected setItems(items: T[]): void {
		this.items = items;
	}

	protected updateResultCount(total: number): void {
		this.resultCountEl?.setText(`${Math.min(total, this.limit)} / ${total}`);
	}

	protected updateFooterText(text: string): void {
		this.statusTextEl?.setText(text);
	}

	protected updateMatchQuery(query: string): void {
		this.query = query;
	}

	protected updatePlaceholder(placeholder: string): void {
		super.setPlaceholder(placeholder);
	}

	protected refreshSuggestions(): void {
		this.inputEl.dispatchEvent(new InputEvent("input", { bubbles: true }));
	}

	private renderMatchedLabel(container: HTMLElement, text: string): void {
		const query = this.query.toLocaleLowerCase();
		let queryIndex = 0;
		for (const character of text) {
			const matches =
				queryIndex < query.length && character.toLocaleLowerCase() === query[queryIndex];
			container.createSpan({
				cls: matches ? "my-palette-suggestion__match" : "",
				text: character,
			});
			if (matches) queryIndex += 1;
		}
	}
}

export async function showSelectionModal<T extends string | SelectionItem>(
	props: ModalProps<T>,
	app: App,
): Promise<T | null> {
	const modal = new SelectionModal(props, app);
	modal.open();
	return new Promise((resolve) => {
		const originalClose = modal.onClose.bind(modal);
		modal.onClose = () => {
			originalClose();
			resolve(modal.selected);
		};
	});
}
