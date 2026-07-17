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

	constructor({ items = [], defaultValue, placeholder = "Search…" }: ModalProps<T>, app: App) {
		super(app);
		this.items = [...items];
		this.selected = defaultValue ?? null;
		this.limit = 15;
		this.setPlaceholder(placeholder);
	}

	onOpen(): void {
		super.onOpen();
		this.modalEl.addClass("my-palette-suggest-modal");
		this.onSelectionModalOpen();
	}

	onClose(): void {
		this.onSelectionModalClose();
		super.onClose();
	}

	getSuggestions(query: string): T[] | Promise<T[]> {
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

	renderSuggestion(item: T, el: HTMLElement): void {
		const result = this.toSelectionItem(item);
		const row = el.createDiv("my-palette-suggestion");
		if (result.icon) {
			const icon = row.createSpan("my-palette-suggestion__icon");
			setIcon(icon, result.icon);
		}
		row.createSpan({ cls: "my-palette-suggestion__label", text: result.label });
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

	protected updatePlaceholder(placeholder: string): void {
		super.setPlaceholder(placeholder);
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
