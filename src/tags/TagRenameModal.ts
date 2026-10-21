import { Modal, Notice, Setting, type App, type TFile } from "obsidian";
import { t } from "src/i18n";
import { tagKey } from "src/tags/tagChoices";
import { normalizeTagName } from "src/tags/tagRename";
import {
	applyTagEditToEach,
	findTagRenameTargets,
	formatTagEditSummary,
	renameTagEdit,
} from "src/tags/tagRenameFiles";
import { openConfirmModal } from "src/ui/confirmModal";

/**
 * タグの一括変更。旧タグと新タグを入力すると、影響するノートの数と統合の有無を見せ、
 * 確認のあとで本文とフロントマターのタグを書き換える。元に戻す機能はない。
 */
export class TagRenameModal extends Modal {
	private from: string;
	private to = "";
	private previewEl!: HTMLElement;
	private applyButton!: HTMLButtonElement;
	private applying = false;

	constructor(
		app: App,
		initialFrom = "",
		private readonly onDone?: () => void,
	) {
		super(app);
		this.from = initialFrom;
	}

	override onOpen(): void {
		this.titleEl.setText(t("tagRename.title"));
		new Setting(this.contentEl).setName(t("tagRename.from")).addText((text) =>
			text
				.setPlaceholder(t("tagRename.fromPlaceholder"))
				.setValue(this.from)
				.onChange((value) => {
					this.from = value;
					this.refresh();
				}),
		);
		new Setting(this.contentEl).setName(t("tagRename.to")).addText((text) => {
			text.setPlaceholder(t("tagRename.toPlaceholder")).onChange((value) => {
				this.to = value;
				this.refresh();
			});
			text.inputEl.addEventListener("keydown", (event) => {
				// Why: 同じキー入力の中で確認を開くと、開いた直後の確認にフォーカスが移り、
				// 続く Enter がその「キャンセル」を押してしまう。確認は次の処理で開く。
				if (event.key === "Enter") window.setTimeout(() => this.apply());
			});
		});

		this.previewEl = this.contentEl.createDiv({ cls: "my-palette-tag-rename__preview" });
		new Setting(this.contentEl).addButton((button) => {
			this.applyButton = button
				.setButtonText(t("tagRename.action"))
				.setCta()
				.onClick(() => {
					void this.apply();
				}).buttonEl;
		});
		this.refresh();
	}

	/** 入力に応じて、影響するノート数・統合の警告・適用できるかを更新する。 */
	private refresh(): void {
		const fromName = normalizeTagName(this.from);
		const toName = normalizeTagName(this.to);
		const lines: string[] = [];
		let ready = false;

		if (this.from.trim() && !fromName) lines.push(t("tagRename.invalidName"));
		if (this.to.trim() && !toName) lines.push(t("tagRename.invalidName"));

		if (fromName && toName) {
			const targets = findTagRenameTargets(this.app, fromName);
			if (targets.length === 0) lines.push(t("tagRename.noTargets"));
			else lines.push(t("tagRename.targets", { count: targets.length }));
			if (this.isMerging(fromName, toName)) lines.push(t("tagRename.merge", { to: toName }));
			lines.push(t("tagRename.irreversible"));
			ready = targets.length > 0 && fromName !== toName;
		}

		this.previewEl.empty();
		for (const line of lines) this.previewEl.createDiv({ text: line });
		this.applyButton.disabled = !ready;
	}

	/**
	 * 新しいタグが既にあると、2つのタグが1つに統合される。大文字・小文字だけの変更は統合ではない。
	 */
	private isMerging(fromName: string, toName: string): boolean {
		return tagKey(fromName) !== tagKey(toName) && this.hasExistingTag(toName);
	}

	private hasExistingTag(name: string): boolean {
		const key = tagKey(name);
		return Object.keys(this.app.metadataCache.getTags()).some((tag) => tagKey(tag) === key);
	}

	private apply(): void {
		if (this.applying) return;
		const fromName = normalizeTagName(this.from);
		const toName = normalizeTagName(this.to);
		if (!fromName || !toName) {
			new Notice(t("tagRename.invalidName"));
			return;
		}
		if (fromName === toName) {
			new Notice(t("tagRename.notice.unchanged"));
			return;
		}

		const targets = findTagRenameTargets(this.app, fromName);
		if (targets.length === 0) {
			new Notice(t("tagRename.noTargets"));
			return;
		}
		// Why: 元に戻せないので、適用の前に必ず確認を挟む。キャンセルしたら何も変えない。
		const paragraphs = [
			t("tagRename.confirm.body", { count: targets.length, from: fromName, to: toName }),
		];
		if (this.isMerging(fromName, toName)) paragraphs.push(t("tagRename.merge", { to: toName }));
		openConfirmModal(this.app, {
			title: t("tagRename.confirm.title"),
			paragraphs,
			action: t("tagRename.confirm.action"),
			onConfirm: () => void this.run(fromName, toName, targets),
		});
	}

	/** 確認のあと、対象のノートを1つずつ書き換える。 */
	private async run(fromName: string, toName: string, targets: TFile[]): Promise<void> {
		if (this.applying) return;
		this.applying = true;
		const summary = await applyTagEditToEach(
			this.app,
			targets,
			renameTagEdit(fromName, toName),
		);
		this.applying = false;

		new Notice(
			formatTagEditSummary(summary, t("tagRename.notice.done", { count: summary.changed })),
		);
		this.close();
		if (summary.changed > 0) this.onDone?.();
	}
}
