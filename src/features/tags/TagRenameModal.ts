import { Notice, type App, type TFile } from "obsidian";
import { t } from "src/i18n";
import { ICONS } from "src/core/icons";
import { tagKey } from "src/core/tagKey";
import { parseTagRenameInput } from "src/features/tags/tagRename";
import {
	applyTagEditToEach,
	findTagRenameTargets,
	formatTagEditSummary,
	renameTagEdit,
} from "src/features/tags/tagRenameFiles";
import { renderSelectionItem, SelectionModal, type SelectionItem } from "src/ui/selectionModal";

interface RenamePlan {
	from: string;
	to: string;
	targets: TFile[];
}

/**
 * タグの一括変更。入力は「旧タグ 新タグ」で、一覧は影響するノートの数と統合の有無を見せる。
 * Ctrl+Enter で本文とフロントマターのタグを書き換える。元に戻す機能はないので、
 * Enter やクリックでは実行しない。
 */
export class TagRenameModal extends SelectionModal<SelectionItem> {
	/** 今の入力で実行できる変更。実行できない入力では undefined。 */
	private plan?: RenamePlan;
	private applying = false;

	constructor(
		app: App,
		initialFrom = "",
		private readonly onDone?: () => void,
	) {
		super(
			{
				placeholder: t("tagRename.placeholder"),
				// Why: 旧タグを入れたままにして、続けて新タグを打てるようにする。
				initialInput: initialFrom ? `#${initialFrom} ` : "",
				search: (query) => this.rows(query),
			},
			app,
		);
	}

	protected override getInitialInputSelectionRange(): [number, number] {
		const end = this.inputEl.value.length;
		return [end, end];
	}

	private rows(query: string): SelectionItem[] {
		this.plan = undefined;
		const input = parseTagRenameInput(query);
		switch (input.kind) {
			case "empty":
				return [{ label: t("tagRename.hint"), icon: ICONS.info }];
			case "invalid":
				return [
					{
						label: t(
							input.reason === "name" ? "tagRename.invalidName" : "tagRename.tooMany",
						),
						icon: ICONS.warning,
					},
				];
			case "from": {
				const count = findTagRenameTargets(this.app, input.from).length;
				return [
					count === 0
						? { label: t("tagRename.noTargets"), icon: ICONS.warning }
						: {
								label: t("tagRename.fromTargets", { from: input.from, count }),
								icon: ICONS.info,
							},
					{ label: t("tagRename.hintTo"), icon: ICONS.info },
				];
			}
			case "ready":
				return this.planRows(input.from, input.to);
		}
	}

	private planRows(from: string, to: string): SelectionItem[] {
		if (from === to) return [{ label: t("tagRename.unchanged"), icon: ICONS.warning }];
		const targets = findTagRenameTargets(this.app, from);
		if (targets.length === 0) return [{ label: t("tagRename.noTargets"), icon: ICONS.warning }];

		this.plan = { from, to, targets };
		const rows: SelectionItem[] = [
			{
				label: `#${from} → #${to}`,
				description: t("tagRename.targets", { count: targets.length }),
				icon: ICONS.ready,
				badge: "Ctrl+Enter",
			},
		];
		if (this.isMerging(from, to))
			rows.push({ label: t("tagRename.merge", { to }), icon: ICONS.warning });
		rows.push({ label: t("tagRename.irreversible"), icon: ICONS.warning });
		return rows;
	}

	/**
	 * 新しいタグが既にあると、2つのタグが1つに統合される。大文字・小文字だけの変更は統合ではない。
	 */
	private isMerging(from: string, to: string): boolean {
		return tagKey(from) !== tagKey(to) && this.hasExistingTag(to);
	}

	private hasExistingTag(name: string): boolean {
		const key = tagKey(name);
		return Object.keys(this.app.metadataCache.getTags()).some((tag) => tagKey(tag) === key);
	}

	override renderSuggestion(item: SelectionItem, el: HTMLElement): void {
		// Why: 入力は検索ではなく旧タグと新タグなので、その文字で行を強調してはいけない。
		renderSelectionItem(item, el);
	}

	protected override async onItemActivated(_item: SelectionItem, event: Event): Promise<void> {
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (!runShortcut) {
			new Notice(t("tagRename.notice.pressCtrlEnter"));
			return;
		}
		if (!this.plan) {
			new Notice(t("tagRename.notice.notReady"));
			return;
		}
		await this.run(this.plan);
	}

	/** 対象のノートを1つずつ書き換える。 */
	private async run({ from, to, targets }: RenamePlan): Promise<void> {
		if (this.applying) return;
		this.applying = true;
		const summary = await applyTagEditToEach(this.app, targets, renameTagEdit(from, to));
		this.applying = false;

		new Notice(
			formatTagEditSummary(summary, t("tagRename.notice.done", { count: summary.changed })),
		);
		this.close();
		if (summary.changed > 0) this.onDone?.();
	}
}
