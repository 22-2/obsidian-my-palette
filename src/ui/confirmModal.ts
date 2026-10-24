import { Modal, Setting, type App } from "obsidian";
import { t } from "src/i18n";

export interface ConfirmModalOptions {
	title: string;
	paragraphs: readonly string[];
	/** 確定ボタンの文言。確定ボタンは警告の色にする。 */
	action: string;
	onConfirm: () => void;
}

/** 元に戻せない操作の確認。キャンセルでは何も変えない。 */
export function openConfirmModal(app: App, options: ConfirmModalOptions): void {
	new ConfirmModal(app, options).open();
}

class ConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly options: ConfirmModalOptions,
	) {
		super(app);
	}

	override onOpen(): void {
		const { title, paragraphs, action, onConfirm } = this.options;
		this.titleEl.setText(title);
		for (const text of paragraphs) this.contentEl.createEl("p", { text });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t("confirm.cancel")).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText(action)
					.setDestructive()
					.setCta()
					.onClick(() => {
						this.close();
						onConfirm();
					}),
			);
	}
}
