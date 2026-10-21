import { Notice, type App, type TFile } from "obsidian";
import { t } from "src/i18n";
import {
	applyTagEditToEach,
	deleteTagEdit,
	findTagTargets,
	formatTagEditSummary,
} from "src/tags/tagRenameFiles";
import { openConfirmModal } from "src/ui/confirmModal";

/**
 * 選んだタグを、子タグも含めてすべてのノートから消す。確認のあとで1ノートずつ書き換える。
 * 対象のノートがなければ通知するだけで、確認は出さない。
 */
export function confirmDeleteTags(app: App, names: readonly string[], onDone?: () => void): void {
	const targets = findTagTargets(app, names);
	if (targets.length === 0) {
		new Notice(t("tagDelete.notice.noTargets"));
		return;
	}
	const tags = names.map((name) => `#${name}`).join(" ");
	openConfirmModal(app, {
		title: t("tagDelete.confirm.title"),
		paragraphs: [t("tagDelete.confirm.body", { count: targets.length, tags })],
		action: t("tagDelete.confirm.action"),
		onConfirm: () => void runDelete(app, names, targets, onDone),
	});
}

async function runDelete(
	app: App,
	names: readonly string[],
	targets: readonly TFile[],
	onDone?: () => void,
): Promise<void> {
	const summary = await applyTagEditToEach(app, targets, deleteTagEdit(names));
	new Notice(
		formatTagEditSummary(summary, t("tagDelete.notice.done", { count: summary.changed })),
	);
	if (summary.changed > 0) onDone?.();
}
