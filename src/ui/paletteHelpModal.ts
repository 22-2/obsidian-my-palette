import { App, Modal, setIcon } from "obsidian";
import type { Prefixes } from "src/palette/inputParser";
import { RELATED_PREFIXES } from "src/palette/inputParser";

/** Shows the small, discoverable syntax guide instead of overloading the input placeholder. */
export class PaletteHelpModal extends Modal {
	constructor(
		app: App,
		private readonly prefixes: Prefixes,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("my-palette-help-modal");
		this.contentEl.empty();
		this.titleEl.setText("Palette help");

		const intro = this.contentEl.createDiv("my-palette-help-modal__intro");
		intro.setText("Type a prefix followed by a space to switch search modes.");

		const modes = this.contentEl.createDiv("my-palette-help-modal__section");
		modes.createEl("h3", { text: "Search modes" });
		const modeRows: Array<[string, string, string]> = [
			[`${this.prefixes.command.trimEnd()} `, "Commands", "Run an Obsidian command"],
			[RELATED_PREFIXES.link, "Outlinks", "Notes linked from the current note"],
			[RELATED_PREFIXES.backlink, "Backlinks", "Notes linking to the current note"],
			["bk ", "Bookmarks", "Search saved bookmarks"],
			["sc ", "Smart Connections", "Search notes related to the current note"],
			[
				`${this.prefixes.everything.trimEnd()} `,
				"Everything",
				"Search the whole Everything index",
			],
			["esdir ", "Everything directory", "Search every file under the Vault folder"],
			[
				`${this.prefixes.includeIgnored.trimEnd()} `,
				"Excluded files",
				"Include ignored files in File search",
			],
		];
		for (const [prefix, name, description] of modeRows) {
			const row = modes.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: prefix });
			row.createSpan({ cls: "my-palette-help-modal__name", text: name });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}

		const actions = this.contentEl.createDiv("my-palette-help-modal__section");
		actions.createEl("h3", { text: "Actions" });
		const actionRows: Array<[string, string]> = [
			["Enter / double-click", "Open or run the active result"],
			["Click / Ctrl+click", "Select one result or toggle several results"],
			["Shift+click", "Select a range of results"],
			["Middle-click", "Open the result in a background tab"],
			["Right-click", "Show actions, including copy actions for a selection"],
			["Ctrl+R", "Open search history"],
			["Esc", "Clear the query, then focus the search field"],
		];
		for (const [gesture, description] of actionRows) {
			const row = actions.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: gesture });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}

		const note = this.contentEl.createDiv("my-palette-help-modal__note");
		const icon = note.createSpan("my-palette-help-modal__note-icon");
		setIcon(icon, "info");
		note.createSpan({
			text: `${this.prefixes.includeIgnored.trimEnd()} is for File search only; it cannot be combined with ${RELATED_PREFIXES.link.trimEnd()} or ${RELATED_PREFIXES.backlink.trimEnd()}.`,
		});
	}
}
