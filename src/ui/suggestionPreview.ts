import { Notice } from "obsidian";
import { matchesHotkey, type PaletteHotkeys } from "src/ui/hotkeys";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";

export class SuggestionPreview<T> {
	private previewGeneration = 0;
	private previewPending = false;

	constructor(
		private readonly inputEl: HTMLInputElement,
		private readonly getHotkeys: () => PaletteHotkeys,
		private readonly getSelectedItem: () => T | undefined,
		private readonly onPreview?: (item: T) => Promise<void> | void,
	) {}

	unload(): void {
		this.previewGeneration += 1;
	}

	/**
	 * プレビューのキー。モーダルと常設のビューで同じ判定にし、フォーカスは入力欄に残す。
	 * 右矢印は入力欄の末尾にカーソルがあるときだけ使い、途中の編集を奪わない。
	 */
	handleKey(event: KeyboardEvent): boolean {
		const onPreview = this.onPreview;
		const hotkey = this.getHotkeys().preview;
		if (!onPreview || !matchesHotkey(event, hotkey)) return false;
		const cursorIsAtEnd =
			this.inputEl.selectionStart === this.inputEl.value.length &&
			this.inputEl.selectionEnd === this.inputEl.value.length;
		const usesCursorKey = hotkey?.key === "ArrowRight" && hotkey.modifiers.length === 0;
		if (usesCursorKey && !this.inputEl.readOnly && !cursorIsAtEnd) return false;
		event.preventDefault();
		event.stopImmediatePropagation();
		const item = this.getSelectedItem();
		if (item === undefined || event.repeat || this.previewPending) return true;
		void this.previewItem(item);
		return true;
	}

	private async previewItem(item: T): Promise<void> {
		this.previewPending = true;
		const generation = this.previewGeneration;
		const selectionStart = this.inputEl.selectionStart;
		const selectionEnd = this.inputEl.selectionEnd;
		const restoreFocus = () => {
			if (generation !== this.previewGeneration || !this.inputEl.isConnected) return;
			// DOM の入力欄に直接フォーカスする。入力モードに切り替えると、プレビューのたびに
			// セレクターの読み取り専用の選択モードが失われてしまうため。
			this.inputEl.focus({ preventScroll: true });
			this.inputEl.setSelectionRange(selectionStart, selectionEnd);
		};
		try {
			await this.onPreview?.(item);
		} catch (error) {
			logger.error("Failed to preview selection", error);
			new Notice(error instanceof Error ? error.message : t("modal.error.previewFailed"));
		} finally {
			this.previewPending = false;
			restoreFocus();
			window.setTimeout(restoreFocus, 0);
		}
	}
}
