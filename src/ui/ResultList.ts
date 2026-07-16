import { setIcon } from "obsidian";
import type { PaletteResult } from "../model/results";

export class ResultList {
	constructor(
		private readonly element: HTMLElement,
		private readonly onSelect: (index: number, activate: boolean) => void,
	) {
		element.setAttribute("role", "listbox");
		element.id = "my-palette-results";
	}
	render(results: PaletteResult[], selectedIndex: number): string | null {
		this.element.empty();
		results.forEach((result, index) => {
			const id = `my-palette-result-${index}`;
			const row = this.element.createDiv({
				cls: "my-palette-result",
				attr: { id, role: "option", "aria-selected": String(index === selectedIndex) },
			});
			if (index === selectedIndex) row.addClass("is-selected");
			const icon = row.createSpan("my-palette-result-icon");
			setIcon(icon, result.icon);
			const text = row.createDiv("my-palette-result-text");
			text.createDiv({ cls: "my-palette-result-primary", text: result.primary });
			text.createDiv({ cls: "my-palette-result-secondary", text: result.secondary });
			row.addEventListener("mousemove", () => this.onSelect(index, false));
			row.addEventListener("click", () => this.onSelect(index, true));
		});
		this.element.querySelector(".is-selected")?.scrollIntoView({ block: "nearest" });
		return results[selectedIndex] ? `my-palette-result-${selectedIndex}` : null;
	}
}
