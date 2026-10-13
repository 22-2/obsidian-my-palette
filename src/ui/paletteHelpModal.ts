import { App, Modal, setIcon } from "obsidian";
import { PALETTE_MODES, paletteModeAlias } from "src/palette/modes";
import type { ModeSettingsMap, PaletteSurface } from "src/settings/model";
import { IGNORED_SHORTCUT } from "src/palette/ignoredToggle";
import { DEFAULT_HOTKEYS, formatHotkey, type PaletteHotkeys } from "src/ui/hotkeys";

/** Shows the small, discoverable syntax guide instead of overloading the input placeholder. */
export class PaletteHelpModal extends Modal {
	constructor(
		app: App,
		private readonly modes: ModeSettingsMap,
		private readonly surface: PaletteSurface = "palette",
		private readonly hotkeys: PaletteHotkeys = DEFAULT_HOTKEYS,
	) {
		super(app);
	}

	onOpen(): void {
		this.modalEl.addClass("my-palette-help-modal");
		this.contentEl.empty();
		this.titleEl.setText("Palette help");

		const intro = this.contentEl.createDiv("my-palette-help-modal__intro");
		intro.setText(
			"Pick a mode in Root Search with Enter or Tab, or type its alias followed by a space. Esc goes back.",
		);

		const modeSection = this.contentEl.createDiv("my-palette-help-modal__section");
		modeSection.createEl("h3", { text: "Search modes" });
		const modeRows = PALETTE_MODES.filter(({ id }) => this.modes[id].enabled).map(
			(mode): [string, string, string] => [
				paletteModeAlias(mode.id, this.modes),
				mode.title,
				mode.subtitle,
			],
		);
		for (const [prefix, name, description] of modeRows) {
			const row = modeSection.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: prefix });
			row.createSpan({ cls: "my-palette-help-modal__name", text: name });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}

		const actions = this.contentEl.createDiv("my-palette-help-modal__section");
		actions.createEl("h3", { text: "Actions" });
		const actionRows: Array<[string, string]> = [
			["Enter / numpad Enter / double-click", "Open or run the active result"],
			["↑ / ↓", "Move through results"],
			["Shift+↑ / Shift+↓", "Extend the result selection"],
			["Ctrl+↑ / Ctrl+↓", "Move the active row without changing the selection"],
			...(this.surface === "palette"
				? ([
						[
							formatHotkey(this.hotkeys.preview),
							"Preview the active result without closing the palette",
						],
						["Home / End", "Move to the start or end of the search input"],
						["Ctrl+Home / Ctrl+End", "Move to the first or last result"],
					] satisfies Array<[string, string]>)
				: []),
			[
				this.hotkeys.hidePreview
					? `Hold ${formatHotkey(this.hotkeys.hidePreview)}`
					: "Disabled",
				"Temporarily fade out the palette; release to restore",
			],
			["Click / Ctrl+click", "Select one result or toggle several results"],
			["Shift+click", "Select a range of results"],
			["Middle-click", "Open the result in a background tab"],
			["Right-click", "Show actions, including copy actions for a selection"],
			...(this.hotkeys.contextMenu
				? ([
						[
							formatHotkey(this.hotkeys.contextMenu),
							"Show actions for the active result",
						],
					] satisfies Array<[string, string]>)
				: []),
			[formatHotkey(this.hotkeys.history), "Open search history"],
			[IGNORED_SHORTCUT[0], "Include files hidden by Excluded files in File search"],
			["Enter / Tab on a mode", "Enter that mode"],
			["Esc / Backspace in an empty field", "Return from a mode to Root Search"],
			[
				"Esc",
				this.surface === "palette"
					? "Close the palette at Root Search"
					: "Clear the query, then focus the search field",
			],
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
			text: "The Ignored switch in the footer appears only in File search.",
		});
	}
}
