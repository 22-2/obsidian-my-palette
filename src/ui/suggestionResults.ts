import { t } from "src/i18n";
import type { SuggestionPanelResultsLayout } from "src/ui/suggestionPanel";

interface RenderResultsOptions<T> {
	container: HTMLElement;
	items: readonly T[];
	query: string;
	emptyStateText: string;
	loading: boolean;
	layout?: SuggestionPanelResultsLayout<T>;
	sectionOf?: (item: T) => string | undefined;
	renderSuggestion: (item: T, el: HTMLElement, query: string) => void;
	decorateRow: (row: HTMLElement, index: number) => void;
}

export function renderSuggestionResults<T>({
	container,
	items,
	query,
	emptyStateText,
	loading,
	layout,
	sectionOf,
	renderSuggestion,
	decorateRow,
}: RenderResultsOptions<T>): void {
	container.empty();
	if (layout) {
		// 描画の形は、このパネルではなくレイアウトが持つ。行の番号と選択はパネルが持つ。
		// キーボードもポインターも、表示されている並び順で動くようにする。
		layout.render(container, items, query, (row, index) => decorateRow(row, index));
	}
	if (!items.length) {
		if (loading) renderLoadingState(container);
		else
			container.createDiv({
				cls: "suggestion-empty",
				text: emptyStateText,
			});
		return;
	}
	if (layout) return;
	let section: string | undefined;
	for (const [index, item] of items.entries()) {
		const nextSection = sectionOf?.(item);
		if (nextSection && nextSection !== section)
			// 見出しは `.suggestion-item` ではないので、行の番号と矢印の移動は、
			// 選べる結果だけを数え続ける。
			container.createDiv({
				cls: "my-palette-section-heading",
				text: nextSection,
				attr: { role: "presentation" },
			});
		section = nextSection;
		const el = container.createDiv("suggestion-item");
		decorateRow(el, index);
		renderSuggestion(item, el, query);
	}
}

/** 検索がすぐ終わる場合は、CSS でスピナーの点滅を抑える。 */
function renderLoadingState(container: HTMLElement): void {
	const loadingEl = container.createDiv({
		cls: "suggestion-empty my-palette-loading",
		attr: { role: "status", "aria-label": t("view.searching") },
	});
	loadingEl.createDiv({ cls: "my-palette-spinner", attr: { "aria-hidden": "true" } });
}
