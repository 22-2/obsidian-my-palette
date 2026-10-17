import { Modal, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PaletteControlsPlugin } from "src/palette/components/PaletteHistoryControls";
import type { SelectorHistoryCategory } from "src/settings/model";
import { DEFAULT_HOTKEYS, formatHotkey } from "src/ui/hotkeys";
import { t } from "src/i18n";

export interface SelectorControls {
	plugin: PaletteControlsPlugin & Pick<MyPalettePlugin, "recordSearch">;
	category: SelectorHistoryCategory;
	title: string;
	description: string;
	actionLabel: string;
	context?: string;
	interactionModes?: boolean;
	selectionMode?: "single" | "extended";
	/** チェックなど、このセレクターだけの追加のショートカット。 */
	shortcuts?: readonly (readonly [string, string])[];
}

/** セレクターのヘルプは、ファイル検索の接頭辞ではなく、独自の操作の語彙を使う。 */
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
		this.titleEl.setText(t("selector.help.title", { title: this.controls.title }));
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
		const hotkeys = this.controls.plugin.settings.hotkeys ?? DEFAULT_HOTKEYS;
		const shortcuts: readonly (readonly [string, string])[] = [
			[
				"↑ / ↓",
				this.controls.interactionModes
					? t("selector.help.arrowsInteraction")
					: t("selector.help.arrows"),
			],
			...(this.controls.interactionModes
				? ([
						[
							t("selector.help.clickInput", {
								key: formatHotkey(hotkeys.focusInput),
							}),
							t("selector.help.returnInput"),
						],
						[t("selector.help.upFromFirst"), t("selector.help.returnInput")],
					] as const)
				: []),
			[
				"Enter / numpad Enter",
				t("selector.help.enter", { action: this.controls.actionLabel }),
			],
			["Home / End", t("help.row.homeEnd")],
			["Ctrl+Home / Ctrl+End", t("help.row.ctrlHomeEnd")],
			...(this.controls.selectionMode === "extended"
				? ([
						[t("help.row.click"), t("help.row.clickDescription")],
						["Shift+click / Shift+↑ / Shift+↓", t("selector.help.shiftSelect")],
						["Ctrl+↑ / Ctrl+↓", t("help.row.ctrlArrows")],
						[
							"Double-click",
							t("selector.help.doubleClick", { action: this.controls.actionLabel }),
						],
						["Right-click", t("selector.help.rightClick")],
						[formatHotkey(hotkeys.contextMenu), t("selector.help.rightClick")],
					] as const)
				: ([
						["Click", t("selector.help.click", { action: this.controls.actionLabel })],
					] as const)),
			...(this.controls.shortcuts ?? []).map(
				([key, description]) =>
					[
						key === "→"
							? formatHotkey(hotkeys.preview)
							: key === "Space"
								? formatHotkey(hotkeys.toggleSelection)
								: key,
						description,
					] as const,
			),
			...(hotkeys.optionsMenu
				? ([
						[
							t("selector.help.optionsKey", {
								key: formatHotkey(hotkeys.optionsMenu),
							}),
							t("help.row.optionsDescription"),
						],
					] as const)
				: []),
			[
				t("selector.help.historyKey", { key: formatHotkey(hotkeys.history) }),
				t("selector.help.historyRestore"),
			],
			[
				hotkeys.hidePreview
					? t("help.row.holdKey", { key: formatHotkey(hotkeys.hidePreview) })
					: t("hotkey.disabled"),
				t("selector.help.fade"),
			],
			["Esc", t("selector.help.cancel")],
		];
		for (const [key, description] of shortcuts) {
			const row = section.createDiv("my-palette-help-modal__row");
			row.createEl("code", { text: key });
			row.createSpan({ cls: "my-palette-help-modal__description", text: description });
		}
	}
}
