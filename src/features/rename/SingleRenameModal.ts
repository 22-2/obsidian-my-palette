import { Notice, type App, type TFile } from "obsidian";
import { renameFiles } from "src/features/rename/renameFiles";
import {
	planRename,
	renameStem,
	setNameRule,
	type RenamePlanRow,
} from "src/features/rename/renamePlan";
import { toRenameItem, type RenameItem } from "src/features/rename/renameItems";
import { renderSelectionItem, SelectionModal } from "src/ui/selectionModal";
import { t } from "src/i18n";

/**
 * 1つのファイルの名前を、入力欄に直接打って変える。入力は拡張子を除いた新しい名前で、
 * 最初は今の名前が全選択で入っている。一覧は変更後の名前をプレビューし、Enter で変更する。
 * 複数のファイルをまとめて変えるときの `検索/置換` は BulkRenameModal が受け持つ。
 */
export class SingleRenameModal extends SelectionModal<RenameItem> {
	private existingPaths?: Set<string>;
	private row?: RenamePlanRow;
	private applying = false;

	constructor(
		app: App,
		private readonly file: TFile,
		private readonly onDone?: () => void,
	) {
		super(
			{
				placeholder: t("rename.single.placeholder"),
				initialInput: renameStem(file.path),
				footerText: t("rename.footer.renaming", { path: file.path }),
				search: (query) => this.plan(query),
			},
			app,
		);
	}

	private plan(query: string): RenameItem[] {
		this.existingPaths ??= new Set(
			this.app.vault.getAllLoadedFiles().map((entry) => entry.path.toLowerCase()),
		);
		const [row] = planRename([this.file.path], setNameRule(query), this.existingPaths);
		this.row = row;
		this.updateResultCount(1);
		return [toRenameItem(row)];
	}

	override renderSuggestion(item: RenameItem, el: HTMLElement): void {
		// Why: 入力は検索ではなく新しい名前なので、その文字で行を強調してはいけない。
		renderSelectionItem(item, el);
	}

	protected override async onItemActivated(): Promise<void> {
		const row = this.row;
		if (!row || this.applying) return;
		if (row.status === "unchanged") {
			new Notice(t("rename.notice.noChange"));
			return;
		}
		if (row.status !== "ready") {
			new Notice(t("rename.notice.fixMarked"));
			return;
		}
		this.applying = true;
		const [result] = await renameFiles(this.app, [row]);
		this.applying = false;
		if (result.result === "renamed") {
			new Notice(t("rename.notice.renamed", { count: 1 }));
			this.close();
			this.onDone?.();
			return;
		}
		new Notice(
			t("rename.notice.renamedWithFailures", {
				count: 0,
				failed: 1,
				list: `${result.path.split("/").pop()}: ${result.reason}`,
			}),
		);
	}
}
