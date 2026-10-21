import { Notice } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { ICONS } from "src/ui/icons";
import { countLabel } from "src/shared/countLabel";
import { executeMerge, type MergePlan } from "src/merge/mergeNotes";
import { openFileInLeaf } from "src/workspace/openLeaf";
import { t } from "src/i18n";

/** 変更予定の1行。ファイルごとに、何が変わるかを縦に並べる。 */
function planItems(plan: MergePlan): SelectionItem[] {
	const target = plan.target.basename;
	const aliasNames = plan.sources.map((file) => file.basename).join(", ");
	const propertyDescriptions = [
		plan.conflicts.length > 0
			? t("merge.plan.conflictsDescription", { keys: plan.conflicts.join(", ") })
			: t("merge.plan.propertiesDescription"),
		plan.aliasSourceNames
			? t("merge.plan.aliasOn", { names: aliasNames })
			: t("merge.plan.aliasOff"),
	];
	const items: SelectionItem[] = [
		{
			label: t("merge.plan.body", { target }),
			description: t("merge.plan.bodyDescription", { count: plan.sources.length }),
			icon: ICONS.merge,
		},
		{
			label: t("merge.plan.properties"),
			description: propertyDescriptions.join(" / "),
			badge: plan.conflicts.length > 0 ? t("merge.plan.conflictBadge") : undefined,
			icon: plan.conflicts.length > 0 ? ICONS.warning : ICONS.editProperties,
		},
	];
	for (const { file, count } of plan.retargets)
		items.push({
			label: file.basename,
			description: t("merge.plan.retargetDescription", { count, target }),
			descriptionTitle: file.path,
			icon: ICONS.backlinks,
		});
	for (const source of plan.sources)
		items.push({
			label: t("merge.plan.trash", { name: source.basename }),
			description: source.path,
			icon: ICONS.delete,
		});
	return items;
}

/**
 * 統合の変更予定を確認するセレクター。Ctrl+Enter で実行する。Esc で閉じると、何も変わらない。
 * 検索は使わないので、入力欄は実行の案内だけを表す。
 */
export class MergePlanModal extends SelectionModal<SelectionItem> {
	private applying = false;

	constructor(
		private readonly plugin: SelectorControls["plugin"],
		private readonly plan: MergePlan,
		private readonly onDone?: () => void,
	) {
		super(
			{
				placeholder: t("merge.plan.placeholder"),
				footerText: t("merge.plan.footer", { target: plan.target.path }),
				controls: {
					plugin,
					category: "merge-target",
					title: t("merge.plan.title"),
					description: t("merge.plan.description"),
					actionLabel: t("merge.plan.action"),
					shortcuts: [["Ctrl+Enter", t("merge.plan.shortcut.ctrlEnter")]],
				},
				// Why: 切り替えたあとに行を描き直せるよう、候補は変更予定から毎回作り直す。
				search: () => planItems(plan),
			},
			plugin.app,
		);
	}

	protected override onSelectionModalOpen(): void {
		this.addSwitch({
			id: "alias-source-names",
			label: t("merge.plan.aliasSwitch"),
			icon: ICONS.edit,
			description: t("merge.plan.aliasSwitchDescription"),
			value: this.plan.aliasSourceNames,
			onChange: (value) => {
				this.plan.aliasSourceNames = value;
				this.refreshSuggestions();
			},
		});
	}

	protected override async onItemActivated(_item: SelectionItem, event: Event): Promise<void> {
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (!runShortcut) {
			new Notice(t("merge.notice.pressCtrlEnterPlan"));
			return;
		}
		if (this.applying) return;
		this.applying = true;
		this.commitSearchHistory();
		const result = await executeMerge(this.app, this.plan);
		this.applying = false;
		if (result.failures.length > 0) {
			new Notice(t("merge.notice.failed", { list: result.failures.join("\n") }));
		} else {
			new Notice(
				t("merge.notice.done", {
					count: countLabel(result.trashed, "ノート"),
					target: this.plan.target.basename,
					links: countLabel(result.retargeted, "ノート"),
				}),
			);
		}
		this.close();
		if (result.trashed > 0 || result.retargeted > 0) this.onDone?.();
		// Why: パレットを閉じたあとに開く。先に開くと、閉じる操作が元のノートへフォーカスを戻す。
		if (result.merged) await this.openTarget();
	}

	private async openTarget(): Promise<void> {
		await openFileInLeaf(this.app, this.plan.target, {
			action: "primary",
			active: true,
			autoFocus: true,
			focusExisting: this.plugin.settings.focusExistingTab,
		});
	}
}
