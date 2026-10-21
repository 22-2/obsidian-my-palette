import { Modal, Notice, Setting, type App, type TFile } from "obsidian";
import { t } from "src/i18n";
import { logger } from "src/shared/logger";
import { applyTagRename, findTagRenameTargets } from "src/tags/tagRenameFiles";
import { tagKey } from "src/tags/tagChoices";
import { normalizeTagName } from "src/tags/tagRename";

/**
 * タグの一括変更。旧タグと新タグを入力すると、影響するノートの数と統合の有無を見せ、
 * 適用すると本文とフロントマターのタグを書き換える。元に戻す機能はない。
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
				if (event.key === "Enter") void this.apply();
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
			// Why: 新しいタグが既にあると、2つのタグが1つに統合されるので警告する。大文字・小文字だけの変更は統合ではない。
			if (tagKey(fromName) !== tagKey(toName) && this.hasExistingTag(toName))
				lines.push(t("tagRename.merge", { to: toName }));
			lines.push(t("tagRename.irreversible"));
			ready = targets.length > 0 && fromName !== toName;
		}

		this.previewEl.empty();
		for (const line of lines) this.previewEl.createDiv({ text: line });
		this.applyButton.disabled = !ready;
	}

	private hasExistingTag(name: string): boolean {
		const key = tagKey(name);
		return Object.keys(this.app.metadataCache.getTags()).some((tag) => tagKey(tag) === key);
	}

	private async apply(): Promise<void> {
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
		new TagRenameConfirmModal(this.app, {
			count: targets.length,
			from: fromName,
			to: toName,
			merging: tagKey(fromName) !== tagKey(toName) && this.hasExistingTag(toName),
			onConfirm: () => void this.run(fromName, toName, targets),
		}).open();
	}

	/** 確認のあと、対象のノートを1つずつ書き換える。 */
	private async run(fromName: string, toName: string, targets: TFile[]): Promise<void> {
		if (this.applying) return;
		this.applying = true;
		let changed = 0;
		let stale = 0;
		const failures: string[] = [];
		// Why: 1ノートずつ書き換える。1件の失敗で残りを止めないため、例外は個別に集める。
		for (const file of targets) {
			try {
				const outcome = await applyTagRename(this.app, file, fromName, toName);
				if (outcome === "changed") changed++;
				if (outcome === "stale") stale++;
			} catch (error) {
				logger.error(`Failed to rename tags in ${file.path}`, error);
				failures.push(
					`${file.path}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		this.applying = false;

		const message = t("tagRename.notice.done", { count: changed });
		const extra = [
			stale > 0 ? t("tagRename.notice.stale", { count: stale }) : "",
			failures.length > 0 ? t("tagRename.notice.failed", { list: failures.join("\n") }) : "",
		].filter(Boolean);
		new Notice([message, ...extra].join("\n"));
		this.close();
		if (changed > 0) this.onDone?.();
	}
}

interface TagRenameConfirmProps {
	count: number;
	from: string;
	to: string;
	merging: boolean;
	onConfirm: () => void;
}

/** タグ変更の確認。元に戻せないので、確定ボタンは警告の色にする。キャンセルでは何も変えない。 */
class TagRenameConfirmModal extends Modal {
	constructor(
		app: App,
		private readonly props: TagRenameConfirmProps,
	) {
		super(app);
	}

	override onOpen(): void {
		const { count, from, to, merging, onConfirm } = this.props;
		this.titleEl.setText(t("tagRename.confirm.title"));
		this.contentEl.createEl("p", { text: t("tagRename.confirm.body", { count, from, to }) });
		if (merging) this.contentEl.createEl("p", { text: t("tagRename.merge", { to }) });
		new Setting(this.contentEl)
			.addButton((button) =>
				button.setButtonText(t("tagRename.confirm.cancel")).onClick(() => this.close()),
			)
			.addButton((button) =>
				button
					.setButtonText(t("tagRename.confirm.action"))
					.setWarning()
					.onClick(() => {
						this.close();
						onConfirm();
					}),
			);
	}
}
