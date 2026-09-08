import { setIcon } from "obsidian";
import type { SearchHistoryResult } from "src/palette/results";

export class SearchHistorySuggest {
	private readonly el: HTMLElement;
	private results: readonly SearchHistoryResult[] = [];
	private selectedIndex = -1;

	constructor(
		private readonly parent: HTMLElement,
		private readonly onSelect: (result: SearchHistoryResult) => void,
	) {
		this.el = parent.createDiv({
			cls: "my-palette-history-suggest",
			attr: { role: "listbox" },
		});
		this.close();
	}

	get isOpen(): boolean {
		return !this.el.hasClass("is-hidden");
	}

	show(results: readonly SearchHistoryResult[]): void {
		this.render(results);
		this.el.removeClass("is-hidden");
	}

	toggle(results: readonly SearchHistoryResult[]): void {
		if (this.isOpen) this.close();
		else this.show(results);
	}

	update(results: readonly SearchHistoryResult[]): void {
		if (!this.isOpen) return;
		this.render(results);
	}

	close(): void {
		this.el.addClass("is-hidden");
	}

	contains(target: Node): boolean {
		return this.el.contains(target);
	}

	moveSelection(delta: number): boolean {
		if (!this.results.length) return false;
		this.selectedIndex =
			(this.selectedIndex + delta + this.results.length) % this.results.length;
		this.updateSelectedItem();
		return true;
	}

	selectCurrent(): boolean {
		const result = this.results[this.selectedIndex];
		if (!result) return false;
		this.onSelect(result);
		return true;
	}

	destroy(): void {
		this.el.remove();
	}

	private render(results: readonly SearchHistoryResult[]): void {
		this.results = results;
		this.selectedIndex = results.length ? 0 : -1;
		this.el.empty();
		if (!results.length) {
			this.el.createDiv({
				cls: "my-palette-history-suggest__empty",
				text: "No search history",
			});
			return;
		}
		for (const [index, result] of results.entries()) {
			const item = this.el.createDiv({
				cls: "my-palette-history-suggest__item",
				attr: {
					role: "option",
					tabindex: "0",
					"aria-selected": String(index === this.selectedIndex),
				},
			});
			if (index === this.selectedIndex) item.addClass("is-selected");
			item.addEventListener("mousedown", (event) => {
				event.preventDefault();
			});
			const icon = item.createSpan("my-palette-history-suggest__icon");
			setIcon(icon, "history");
			item.createSpan({
				cls: "my-palette-history-suggest__label",
				text: result.primary,
			});
			item.addEventListener("click", () => this.onSelect(result));
			item.addEventListener("keydown", (event) => {
				if (event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				this.onSelect(result);
			});
		}
	}

	private updateSelectedItem(): void {
		for (const [index, item] of [
			...this.el.querySelectorAll<HTMLElement>(".my-palette-history-suggest__item"),
		].entries()) {
			const selected = index === this.selectedIndex;
			item.toggleClass("is-selected", selected);
			item.setAttr("aria-selected", String(selected));
		}
	}
}
