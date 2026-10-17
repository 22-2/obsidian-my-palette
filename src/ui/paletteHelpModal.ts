import { App, Modal, setIcon } from "obsidian";
import { PALETTE_MODES, paletteModeAlias } from "src/palette/modes";
import type { ModeSettingsMap, PaletteSurface } from "src/settings/model";
import { DEFAULT_HOTKEYS, formatHotkey, type PaletteHotkeys } from "src/ui/hotkeys";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** 入力欄のプレースホルダーに詰め込まず、見つけやすい構文の案内を表示する。 */
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
		this.titleEl.setText(t("help.title"));

		const enterMode = this.hotkeys.enterMode ? formatHotkey(this.hotkeys.enterMode) : undefined;
		const intro = this.contentEl.createDiv("my-palette-help-modal__intro");
		intro.setText(t("help.intro"));

		const modeSection = this.contentEl.createDiv("my-palette-help-modal__section");
		modeSection.createEl("h3", { text: t("help.modes") });
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
		actions.createEl("h3", { text: t("help.actions") });
		const actionRows: Array<[string, string]> = [
			[t("help.row.enter"), t("help.row.enterDescription")],
			["↑ / ↓", t("help.row.arrows")],
			["Shift+↑ / Shift+↓", t("help.row.shiftArrows")],
			["Ctrl+↑ / Ctrl+↓", t("help.row.ctrlArrows")],
			...(this.surface === "palette"
				? ([
						[formatHotkey(this.hotkeys.preview), t("help.row.preview")],
						["Home / End", t("help.row.homeEnd")],
						["Ctrl+Home / Ctrl+End", t("help.row.ctrlHomeEnd")],
					] satisfies Array<[string, string]>)
				: []),
			[
				this.hotkeys.hidePreview
					? t("help.row.holdKey", { key: formatHotkey(this.hotkeys.hidePreview) })
					: t("hotkey.disabled"),
				t("help.row.fade"),
			],
			[t("help.row.click"), t("help.row.clickDescription")],
			[t("help.row.shiftClick"), t("help.row.shiftClickDescription")],
			[t("help.row.middleClick"), t("help.row.middleClickDescription")],
			[t("help.row.rightClick"), t("help.row.rightClickDescription")],
			...(this.hotkeys.contextMenu
				? ([
						[
							formatHotkey(this.hotkeys.contextMenu),
							t("help.row.contextMenuDescription"),
						],
					] satisfies Array<[string, string]>)
				: []),
			...(this.hotkeys.optionsMenu
				? ([
						[formatHotkey(this.hotkeys.optionsMenu), t("help.row.optionsDescription")],
					] satisfies Array<[string, string]>)
				: []),
			[formatHotkey(this.hotkeys.history), t("help.row.historyDescription")],
			[
				t("help.row.modeEnterKeys", {
					keys: enterMode ? `Enter / ${enterMode}` : "Enter",
				}),
				t("help.row.modeEnterDescription"),
			],
			[t("help.row.escBackKeys"), t("help.row.escBackDescription")],
			["Esc", this.surface === "palette" ? t("help.row.escHome") : t("help.row.escSelector")],
		];
		for (const [gesture, description] of actionRows) {
			const row = actions.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: gesture });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}

		const note = this.contentEl.createDiv("my-palette-help-modal__note");
		const icon = note.createSpan("my-palette-help-modal__note-icon");
		setIcon(icon, ICONS.info);
		note.createSpan({ text: t("help.note") });
	}
}
