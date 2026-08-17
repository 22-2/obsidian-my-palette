import { App, setIcon } from "obsidian";
import fuzzysort from "fuzzysort";
import { BaseSuggestModal, type SuggestModalProps } from "src/ui/baseSuggestModal";

export interface SelectionItem {
	label: string;
	description?: string;
	descriptionTitle?: string;
	icon?: string;
	badge?: string;
	value?: unknown;
}

/** 候補の表示内容と検索方法だけを定義する選択モーダル。 */
export class SelectionModal<T> extends BaseSuggestModal<T> {
	constructor(props: SuggestModalProps<T>, app: App) {
		super(props, app);
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
		if (result.description) {
			const description = row.createSpan({
				cls: "my-palette-suggestion__description",
				text: result.description,
			});
			if (result.descriptionTitle) description.setAttr("title", result.descriptionTitle);
		}
		if (result.badge)
			row.createSpan({ cls: "my-palette-suggestion__badge", text: result.badge });
	}

	protected toSelectionItem(item: T): SelectionItem {
		if (typeof item === "string") return { label: item };
		return item as unknown as SelectionItem;
	}

	private renderMatchedLabel(container: HTMLElement, text: string): void {
		const matched = this.query ? fuzzysort.single(this.query, text) : null;
		if (!matched) {
			container.createSpan({ text });
			return;
		}
		const indexes = new Set(matched.indexes);
		for (let index = 0; index < text.length; index += 1) {
			container.createSpan({
				cls: indexes.has(index) ? "my-palette-suggestion__match" : "",
				text: text[index],
			});
		}
	}
}

export function openSelectionModal<T extends string | SelectionItem>(
	props: SuggestModalProps<T>,
	app: App,
	onChoose: (item: T) => void | Promise<void>,
): void {
	class CallbackSelectionModal extends SelectionModal<T> {
		protected override async onItemActivated(item: T): Promise<void> {
			this.close();
			await onChoose(item);
		}
	}

	new CallbackSelectionModal(props, app).open();
}
