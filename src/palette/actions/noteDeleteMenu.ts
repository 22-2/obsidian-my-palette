import { Notice, TFile, type App } from "obsidian";
import { t } from "src/i18n";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { openConfirmModal } from "src/ui/confirmModal";
import { ICONS } from "src/ui/icons";

/** Markdown ノートの結果だけを重複なく集める。 */
function resolveNotes(app: App, results: readonly PaletteResult[]): TFile[] {
	const notes = new Map<string, TFile>();
	for (const result of results) {
		if (result.mode !== "file") continue;
		const file = resolveVaultFile(app, result);
		if (file?.extension.toLocaleLowerCase() === "md") notes.set(file.path, file);
	}
	return [...notes.values()];
}

/** ノートをゴミ箱へ移動する確認付き操作を追加する。 */
export function addNoteDeleteMenuItem(
	app: App,
	menu: PaletteMenu,
	results: readonly PaletteResult[],
	onResultsChanged?: () => void,
): void {
	const notes = resolveNotes(app, results);
	if (notes.length === 0) return;

	const count = notes.length;
	const title =
		count === 1 ? t("noteDelete.menu.single") : t("noteDelete.menu.multiple", { count });
	menu.addItem((item) =>
		item
			.setTitle(title)
			.setIcon(ICONS.delete)
			.setSearchTerms("delete-note trash-note")
			.setWarning(true)
			.onClick(() =>
				openConfirmModal(app, {
					title:
						count === 1
							? t("noteDelete.confirm.title.single")
							: t("noteDelete.confirm.title.multiple"),
					paragraphs: [
						count === 1
							? t("noteDelete.confirm.body.single", { name: notes[0].name })
							: t("noteDelete.confirm.body.multiple", { count }),
					],
					action: t("noteDelete.confirm.action"),
					onConfirm: () => void trashNotes(app, notes, onResultsChanged),
				}),
			),
	);
}

/** 失敗があっても残りのノートを処理し、結果を通知する。 */
async function trashNotes(
	app: App,
	notes: readonly TFile[],
	onResultsChanged?: () => void,
): Promise<void> {
	let trashed = 0;
	const failures: string[] = [];
	for (const note of notes) {
		try {
			const current = app.vault.getAbstractFileByPath(note.path);
			if (!(current instanceof TFile) || current.extension.toLocaleLowerCase() !== "md") {
				throw new Error(t("noteDelete.error.missing"));
			}
			await app.fileManager.trashFile(current);
			trashed += 1;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			failures.push(`${note.path}: ${reason}`);
		}
	}

	if (trashed > 0) onResultsChanged?.();
	if (failures.length === 0) {
		new Notice(t("noteDelete.notice.done", { count: trashed }));
		return;
	}
	new Notice(
		t("noteDelete.notice.failed", {
			trashed,
			failed: failures.length,
			list: failures.join("\n"),
		}),
		10000,
	);
}
