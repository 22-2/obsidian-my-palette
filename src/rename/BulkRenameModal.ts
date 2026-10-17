import { Notice, TFile } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { renderSelectionItem, SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import {
	isBlocked,
	parseRenameRule,
	planRename,
	renamableRows,
	type RenameOptions,
	type RenamePlanRow,
	type RenameStatus,
} from "src/rename/renamePlan";
import { ICONS } from "src/ui/icons";
import { countLabel } from "src/shared/countLabel";
import { t } from "src/i18n";

interface RenameItem extends SelectionItem {
	row: RenamePlanRow;
}

const STATUS_BADGE: Record<RenameStatus, string | undefined> = {
	ready: undefined,
	unchanged: t("rename.status.unchanged"),
	invalid: t("rename.status.invalid"),
	exists: t("rename.status.exists"),
	duplicate: t("rename.status.duplicate"),
};

function directoryOf(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash < 0 ? "/" : path.slice(0, slash);
}

function toItem(row: RenamePlanRow): RenameItem {
	const changed = row.status !== "unchanged";
	return {
		label: changed ? `${row.oldName} → ${row.newName}` : row.oldName,
		description: directoryOf(row.path),
		icon: row.status === "ready" ? ICONS.ready : changed ? ICONS.warning : ICONS.file,
		badge: STATUS_BADGE[row.status],
		row,
	};
}

/**
 * 名前変更のセレクター: 入力は `検索/置換` のルールで、一覧は新しい名前をすべてプレビューする。
 * 変わるのは Vault 内のファイル名だけ。フォルダーと拡張子はそのまま。
 */
export class BulkRenameModal extends SelectionModal<RenameItem> {
	private readonly paths: string[];
	private existingPaths?: Set<string>;
	private rows: RenamePlanRow[] = [];
	private options: RenameOptions = { regex: false, matchCase: true, all: true };
	private applying = false;

	constructor(
		private readonly plugin: SelectorControls["plugin"],
		files: readonly TFile[],
		private readonly onDone?: () => void,
	) {
		const paths = files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
		super(
			{
				placeholder: t("rename.placeholder"),
				footerText:
					paths.length === 1
						? t("rename.footer.renaming", { path: paths[0] })
						: t("rename.footer.renamingMany", {
								what: countLabel(paths.length, "ファイル"),
							}),
				controls: {
					plugin,
					category: "bulk-rename",
					title: t("rename.controls.title"),
					description: t("rename.controls.description"),
					actionLabel: t("rename.action"),
					shortcuts: [
						["Ctrl+Enter", t("rename.shortcut.ctrlEnter")],
						[t("rename.shortcut.findReplaceKey"), t("rename.shortcut.findReplace")],
					],
				},
				search: (query) => this.plan(query),
			},
			plugin.app,
		);
		this.paths = paths;
		this.limit = Math.max(this.limit, paths.length);
	}

	protected override onSelectionModalOpen(): void {
		const toggle = (
			id: keyof RenameOptions,
			label: string,
			icon: string,
			description: string,
		) =>
			this.addSwitch({
				id,
				label,
				icon,
				description,
				value: this.options[id],
				onChange: (value) => {
					this.options = { ...this.options, [id]: value };
					this.refreshSuggestions();
				},
			});
		toggle("regex", t("rename.option.regex"), ICONS.regex, t("rename.option.regexDescription"));
		toggle(
			"matchCase",
			t("rename.option.matchCase"),
			ICONS.matchCase,
			t("rename.option.matchCaseDescription"),
		);
		toggle("all", t("rename.option.all"), ICONS.replaceAll, t("rename.option.allDescription"));
	}

	private plan(query: string): RenameItem[] {
		const rule = parseRenameRule(query, this.options);
		if (rule.kind === "error") {
			this.rows = [];
			this.emptyStateText = rule.message;
			this.updateResultCount(0);
			return [];
		}
		this.existingPaths ??= new Set(
			this.app.vault.getAllLoadedFiles().map((entry) => entry.path.toLowerCase()),
		);
		this.rows = planRename(this.paths, rule, this.existingPaths);
		this.updateResultCount(this.rows.length);
		const count = renamableRows(this.rows).length;
		this.updateFooterText(
			count > 0
				? t("rename.footer.willRename", { count, total: this.rows.length })
				: t("rename.footer.renamingMany", {
						what: countLabel(this.rows.length, "ファイル"),
					}),
		);
		return this.rows.map(toItem);
	}

	override renderSuggestion(item: RenameItem, el: HTMLElement): void {
		// Why: 入力はルールであって検索ではないので、その文字がラベルを強調してはいけない。
		renderSelectionItem(item, el);
	}

	protected override async onItemActivated(_item: RenameItem, event: Event): Promise<void> {
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (!runShortcut) {
			new Notice(t("rename.notice.pressCtrlEnter"));
			return;
		}
		await this.apply();
	}

	private async apply(): Promise<void> {
		if (this.applying) return;
		if (isBlocked(this.rows)) {
			new Notice(t("rename.notice.fixMarked"));
			return;
		}
		const targets = renamableRows(this.rows);
		if (targets.length === 0) {
			new Notice(t("rename.notice.noChange"));
			return;
		}
		this.applying = true;
		this.commitSearchHistory();
		let renamed = 0;
		const failures: string[] = [];
		// Why: 1つずつ名前を変えて、名前の変更のたびにリンクを更新してから次を始める。
		for (const row of targets) {
			const file = this.app.vault.getAbstractFileByPath(row.path);
			if (!(file instanceof TFile)) {
				failures.push(`${row.oldName}: ${t("rename.error.notFound")}`);
				continue;
			}
			try {
				await this.app.fileManager.renameFile(file, row.newPath);
				renamed++;
			} catch (error) {
				failures.push(
					`${row.oldName}: ${error instanceof Error ? error.message : String(error)}`,
				);
			}
		}
		this.applying = false;
		new Notice(
			failures.length === 0
				? t("rename.notice.renamed", { count: renamed })
				: t("rename.notice.renamedWithFailures", {
						count: renamed,
						failed: failures.length,
						list: failures.join("\n"),
					}),
		);
		this.close();
		if (renamed > 0) this.onDone?.();
	}
}
