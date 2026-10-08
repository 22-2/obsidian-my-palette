import { App, setIcon } from "obsidian";
import fuzzysort from "fuzzysort";
import { BaseSuggestModal, type SuggestModalProps } from "src/ui/baseSuggestModal";
import { matchedQueryIndexes } from "src/ui/queryHighlight";

export interface SelectionItem {
	label: string;
	description?: string;
	descriptionTitle?: string;
	icon?: string;
	badge?: string;
	tags?: string[];
	tagsTitle?: string;
	value?: unknown;
}

/** Render a selection row without requiring a SuggestModal host. */
export function renderSelectionItem(
	result: SelectionItem,
	container: HTMLElement,
	query = "",
): void {
	const row = container.createDiv("my-palette-suggestion");
	if (result.icon) {
		const icon = row.createSpan("my-palette-suggestion__icon");
		setIcon(icon, result.icon);
	}
	const body = row.createDiv("my-palette-suggestion__body");
	const main = body.createDiv("my-palette-suggestion__main");
	const label = main.createSpan("my-palette-suggestion__label");
	renderMatchedLabel(label, result.label, query);
	if (result.description) {
		const description = main.createSpan({
			cls: "my-palette-suggestion__description",
			text: result.description,
		});
		if (result.descriptionTitle) description.setAttr("title", result.descriptionTitle);
	}
	if (result.badge) main.createSpan({ cls: "my-palette-suggestion__badge", text: result.badge });
	if (result.tags?.length) {
		// Matching tags and keywords explain the hit below the compact filename/path row.
		const tags = body.createDiv("my-palette-suggestion__tags");
		tags.setAttr("title", result.tagsTitle ?? result.tags.join(" "));
		for (const tag of result.tags)
			tags.createSpan({ cls: "my-palette-suggestion__tag", text: tag });
	}
}

/** 候補の表示内容と検索方法だけを定義する選択モーダル。 */
export class SelectionModal<T> extends BaseSuggestModal<T> {
	private readonly searchProvider?: NonNullable<SuggestModalProps<T>["search"]>;

	constructor(props: SuggestModalProps<T>, app: App) {
		super(props, app);
		this.searchProvider = props.search;
	}

	async getSuggestions(query: string): Promise<T[]> {
		this.query = query;
		if (this.searchProvider) {
			const results = await this.searchProvider(query);
			this.updateResultCount(results.length);
			return results;
		}
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
		renderSelectionItem(result, el, this.query);
	}

	protected toSelectionItem(item: T): SelectionItem {
		if (typeof item === "string") return { label: item };
		return item as unknown as SelectionItem;
	}
}

function renderMatchedLabel(container: HTMLElement, text: string, query: string): void {
	const indexes = new Set(matchedQueryIndexes(text, query));
	if (indexes.size === 0) {
		container.createSpan({ text });
		return;
	}
	for (let index = 0; index < text.length; index += 1) {
		container.createSpan({
			cls: indexes.has(index) ? "my-palette-suggestion__match" : "",
			text: text[index],
		});
	}
}

export function openSelectionModal<T extends string | SelectionItem>(
	props: SuggestModalProps<T>,
	app: App,
	onChoose: (item: T) => void | Promise<void>,
	onContextMenu?: (item: T, event: MouseEvent, close: () => void) => void,
): void {
	class CallbackSelectionModal extends SelectionModal<T> {
		protected override handlesSuggestionContextMenu(): boolean {
			return onContextMenu !== undefined;
		}

		protected override onSuggestionContextMenu(item: T, event: MouseEvent): void {
			onContextMenu?.(item, event, () => this.close());
		}

		protected override async onItemActivated(item: T): Promise<void> {
			this.close();
			await onChoose(item);
		}
	}

	new CallbackSelectionModal(props, app).open();
}
