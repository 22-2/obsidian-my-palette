import { Notice, type TFile, type App } from "obsidian";
import { t } from "src/i18n";
import { collectVaultFiles } from "src/features/palette/actions/resultFile";
import type { PaletteResult } from "src/core/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { openConfirmPalette } from "src/ui/confirmPalette";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { trashFiles } from "src/features/trash/trashNotes";

function isMarkdown(file: TFile): boolean {
	return file.extension.toLocaleLowerCase() === "md";
}

/** Notes の結果が指す Vault のファイルを、ノート以外(`.base`、`.canvas`、添付など)も含めて重複なく集める。 */
function resolveFiles(app: App, results: readonly PaletteResult[]): TFile[] {
	return collectVaultFiles(app, results, { acceptResult: (result) => result.mode === "file" });
}

/**
 * ファイルをゴミ箱へ移動する確認付き操作を追加する。対象がすべて Markdown ノートなら「ノート」、
 * ほかの種類が混ざれば「ファイル」と呼ぶ。
 */
export function addFileDeleteMenuItem(
	app: App,
	menu: PaletteMenu,
	results: readonly PaletteResult[],
	onResultsChanged?: () => void,
): void {
	const files = resolveFiles(app, results);
	if (files.length === 0) return;

	const count = files.length;
	const single = count === 1;
	const notes = files.every(isMarkdown);
	const action = notes ? MENU_ACTIONS.deleteNote : MENU_ACTIONS.deleteFile;
	const wording = notes
		? {
				menu: t("noteDelete.menu.multiple", { count }),
				title: single
					? t("noteDelete.confirm.title.single")
					: t("noteDelete.confirm.title.multiple"),
				body: single
					? t("noteDelete.confirm.body.single", { name: files[0].name })
					: t("noteDelete.confirm.body.multiple", { count }),
			}
		: {
				menu: t("fileDelete.menu.multiple", { count }),
				title: single
					? t("fileDelete.confirm.title.single")
					: t("fileDelete.confirm.title.multiple"),
				body: single
					? t("fileDelete.confirm.body.single", { name: files[0].name })
					: t("fileDelete.confirm.body.multiple", { count }),
			};
	menu.addItem((item) => {
		withAction(item, action)
			.setSearchTerms(action.id, notes ? "trash-note" : "trash-file")
			.setWarning(true);
		if (!single) item.setTitle(wording.menu);
		item.onClick(() =>
			openConfirmPalette(app, {
				title: wording.title,
				paragraphs: [wording.body],
				action: t("noteDelete.confirm.action"),
				onConfirm: () => void trashAndNotify(app, files, notes, onResultsChanged),
			}),
		);
	});
}

/** 失敗があっても残りのファイルを処理し、結果を通知する。 */
async function trashAndNotify(
	app: App,
	files: readonly TFile[],
	notes: boolean,
	onResultsChanged?: () => void,
): Promise<void> {
	const results = await trashFiles(
		app,
		files.map((file) => file.path),
	);
	const trashed = results.filter((result) => result.result === "trashed").length;
	const failures = results
		.filter((result) => result.result === "failed")
		.map((result) => `${result.path}: ${result.reason}`);

	if (trashed > 0) onResultsChanged?.();
	if (failures.length === 0) {
		new Notice(
			t(notes ? "noteDelete.notice.done" : "fileDelete.notice.done", { count: trashed }),
		);
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
