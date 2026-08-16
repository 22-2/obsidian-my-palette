import { App, SuggestModal, setIcon, type KeymapEventHandler } from "obsidian";
import fuzzysort from "fuzzysort";

export interface SelectionItem {
	label: string;
	description?: string;
	descriptionTitle?: string;
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

interface SuggestionChooser<T> {
	values?: T[];
	selectedItem?: number;
	setSelectedItem?: (index: number) => void;
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
	protected initialInputReady: boolean;

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
		this.initialInputReady = !initialInput;
		this.footerText = footerText;
		this.inputEl.value = initialInput;
		this.limit = 50;
		this.setPlaceholder(placeholder);
		const scopeHandlers = (this.scope as unknown as { keys?: KeymapEventHandler[] }).keys ?? [];
		for (let index = scopeHandlers.length - 1; index >= 0; index -= 1) {
			const handler = scopeHandlers[index];
			if ((handler.key === "Home" || handler.key === "End") && handler.modifiers === "")
				this.scope.unregister(handler);
		}
		for (const key of ["Home", "End"]) {
			this.scope.register([], key, (event) => this.handleHomeEnd(event));
			this.scope.register(["Ctrl"], key, (event) => this.handleHomeEnd(event));
		}
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
				this.initialInputReady = true;
				this.refreshSuggestions();
				const [selectionStart, selectionEnd] = this.getInitialInputSelectionRange();
				this.inputEl.setSelectionRange(selectionStart, selectionEnd);
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

	onChooseSuggestion(item: T, event: MouseEvent | KeyboardEvent): void {
		this.selected = item;
		void this.onItemActivated(item, event);
	}

	protected onSelectionModalOpen(): void {}
	protected onSelectionModalClose(): void {}

	protected getInitialInputSelectionRange(): [number, number] {
		return [0, this.inputEl.value.length];
	}

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

	private handleHomeEnd(event: KeyboardEvent): false | undefined {
		if (
			event.target !== this.inputEl ||
			event.isComposing ||
			(event.key !== "Home" && event.key !== "End")
		)
			return undefined;

		if (!event.ctrlKey || event.altKey || event.metaKey) {
			const position = event.key === "Home" ? 0 : this.inputEl.value.length;
			this.inputEl.setSelectionRange(position, position);
			return false;
		}

		const chooser = (this as unknown as { chooser?: SuggestionChooser<T> }).chooser;
		const count = chooser?.values?.length ?? 0;
		if (!count) return false;
		chooser?.setSelectedItem?.(event.key === "Home" ? 0 : count - 1);
		return false;
	}

	private renderMatchedLabel(container: HTMLElement, text: string): void {
		// 検索は fuzzysort で行っているので、ハイライト位置も fuzzysort の
		// マッチ index に揃える。クエリを先頭から貪欲に拾う独自走査だと、
		// 実際のマッチ箇所とズレて無関係な文字までハイライトされてしまう。
		const matched = this.query ? fuzzysort.single(this.query, text) : null;
		if (!matched) {
			container.createSpan({ text });
			return;
		}
		const indexes = new Set(matched.indexes);
		// indexes は UTF-16 コード単位の位置なので、for..of(コードポイント)ではなく
		// インデックス走査で位置を合わせる
		for (let index = 0; index < text.length; index += 1) {
			container.createSpan({
				cls: indexes.has(index) ? "my-palette-suggestion__match" : "",
				text: text[index],
			});
		}
	}
}

export function openSelectionModal<T extends string | SelectionItem>(
	props: ModalProps<T>,
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
