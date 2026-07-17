import { App, SuggestModal, setIcon } from "obsidian";
import { microFuzzy } from "src/core/strings";

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

	constructor({ items = [], defaultValue, placeholder = "Search…" }: ModalProps<T>, app: App) {
		super(app);
		this.items = [...items];
		this.selected = defaultValue ?? null;
		this.limit = 50;
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("my-palette-suggest-modal");
		this.resultCountEl = document.createElement("div");
		this.resultCountEl.addClass("my-palette-result-count");
		this.resultContainerEl.insertAdjacentElement("afterend", this.resultCountEl);
		this.updateResultCount(0);
		this.onSelectionModalOpen();
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
		const normalized = query.toLocaleLowerCase();
		const results = this.items
			.map((item) => ({
				item,
				score: microFuzzy(this.toSelectionItem(item).label.toLocaleLowerCase(), normalized)
					.score,
			}))
			.filter(({ score }) => score > 0)
			.sort((a, b) => b.score - a.score)
			.map(({ item }) => item);
		this.updateResultCount(results.length);
		return results;
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

	protected updateMatchQuery(query: string): void {
		this.query = query;
	}

	protected updatePlaceholder(placeholder: string): void {
		super.setPlaceholder(placeholder);
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
