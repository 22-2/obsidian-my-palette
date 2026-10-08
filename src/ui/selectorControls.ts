import { Modal, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteControlsPlugin } from "src/palette/components/PaletteHistoryControls";
import type { SelectorHistoryCategory } from "src/settings/model";

export interface SelectorControls {
	plugin: PaletteControlsPlugin & Pick<MyPalettePlugin, "recordSearch">;
	category: SelectorHistoryCategory;
	title: string;
	description: string;
	actionLabel: string;
	context?: string;
	interactionModes?: boolean;
	selectionMode?: "single" | "extended";
	/** Additional shortcuts specific to this selector, such as checking candidates. */
	shortcuts?: readonly (readonly [string, string])[];
}

/** Selector help uses its own action vocabulary instead of file-search prefixes. */
export class SelectorHelpModal extends Modal {
	constructor(
		app: App,
		private readonly controls: SelectorControls,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("my-palette-help-modal");
		this.contentEl.empty();
		this.titleEl.setText(`${this.controls.title} help`);
		this.contentEl.createDiv({
			cls: "my-palette-help-modal__intro",
			text: this.controls.description,
		});
		if (this.controls.context)
			this.contentEl.createDiv({
				cls: "my-palette-help-modal__intro",
				text: this.controls.context,
			});
		const section = this.contentEl.createDiv("my-palette-help-modal__section");
		const shortcuts: readonly (readonly [string, string])[] = [
			[
				"↑ / ↓",
				this.controls.interactionModes
					? "Enter selection mode at the first result, then move through results"
					: "Move through results",
			],
			...(this.controls.interactionModes
				? ([
						["f / click input", "Return to input mode"],
						["↑ from the first result", "Return to input mode"],
					] as const)
				: []),
			["Enter / numpad Enter", `${this.controls.actionLabel} the active selection`],
			["Home / End", "Move to the start or end of the search input"],
			["Ctrl+Home / Ctrl+End", "Move to the first or last result"],
			...(this.controls.selectionMode === "extended"
				? ([
						["Click / Ctrl+click", "Select one result or toggle several results"],
						["Shift+click / Shift+↑ / Shift+↓", "Extend the result selection"],
						["Ctrl+↑ / Ctrl+↓", "Move the active row without changing the selection"],
						["Double-click", `${this.controls.actionLabel} the active selection`],
						["Right-click", "Show actions for the selection"],
					] as const)
				: ([["Click", `${this.controls.actionLabel} the result`]] as const)),
			...(this.controls.shortcuts ?? []),
			["Ctrl+R / history button", "Restore a saved search without running an action"],
			["Hold Alt+H", "Temporarily hide the modal to inspect the preview; release to restore"],
			["Esc", "Cancel"],
		];
		for (const [key, description] of shortcuts) {
			const row = section.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: key });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}
	}
}
