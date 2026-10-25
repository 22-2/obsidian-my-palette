import { Notice, type TFile } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { ICONS } from "src/ui/icons";
import { logger } from "src/shared/logger";
import { planMerge } from "src/merge/mergeNotes";
import { MergePlanModal } from "src/merge/MergePlanModal";
import { t } from "src/i18n";

interface TargetItem extends SelectionItem {
	file: TFile;
}

function isCtrlEnter(event: Event): boolean {
	return (
		event.type === "keydown" &&
		((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey)
	);
}

/**
 * マージ先のノートを選ぶセレクター。Ctrl+Enter で変更予定を開く。統合元は、この一覧に出さない。
 * 変更予定を確認して実行するまで、どのファイルも変わらない。
 */
export class MergeTargetModal extends SelectionModal<TargetItem> {
	constructor(
		private readonly plugin: SelectorControls["plugin"],
		private readonly sources: readonly TFile[],
		private readonly onDone?: () => void,
	) {
		const sourcePaths = new Set(sources.map((file) => file.path));
		const selectedTargets =
			sources.length > 1
				? sources.map((file) => ({
						label: file.basename,
						description: file.path,
						icon: ICONS.note,
						file,
					}))
				: [];
		const otherTargets = plugin.app.vault
			.getMarkdownFiles()
			.filter((file) => !sourcePaths.has(file.path))
			.sort((a, b) => a.path.localeCompare(b.path))
			.map((file) => ({
				label: file.basename,
				description: file.path,
				icon: ICONS.note,
				file,
			}));
		const items = [...selectedTargets, ...otherTargets];
		const paths = sources.map((file) => file.path).sort((a, b) => a.localeCompare(b));
		super(
			{
				placeholder: t("merge.placeholder"),
				footerText:
					paths.length === 1
						? t("merge.footer.one", { path: paths[0] ?? "" })
						: t("merge.footer.many", { count: paths.length }),
				controls: {
					plugin,
					category: "merge-target",
					title: t("merge.controls.title"),
					description: t("merge.controls.description"),
					actionLabel: t("merge.action"),
					shortcuts: [["Ctrl+Enter", t("merge.shortcut.ctrlEnter")]],
				},
				items,
			},
			plugin.app,
		);
	}

	protected override async onItemActivated(item: TargetItem, event: Event): Promise<void> {
		if (!isCtrlEnter(event)) {
			new Notice(t("merge.notice.pressCtrlEnter"));
			return;
		}
		this.commitSearchHistory();
		try {
			const plan = await planMerge(this.app, this.sources, item.file);
			this.close();
			new MergePlanModal(this.plugin, plan, this.onDone).open();
		} catch (error) {
			logger.error("Failed to plan merge", error);
			new Notice(t("merge.notice.planFailed"));
		}
	}
}
