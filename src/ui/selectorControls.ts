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
		const section = this.contentEl.createDiv("my-palette-help-modal__section");
		const shortcuts: readonly (readonly [string, string])[] = [
			["↑ / ↓", "Enter selection mode at the first result, then move through results"],
			["f / click input", "Return to input mode"],
			["Enter / numpad Enter", `${this.controls.actionLabel} the active selection`],
			...(this.controls.shortcuts ?? []),
			["Ctrl+R / history button", "Restore a saved search without running an action"],
			["Esc", "Cancel"],
		];
		for (const [key, description] of shortcuts) {
			const row = section.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: key });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}
	}
}
