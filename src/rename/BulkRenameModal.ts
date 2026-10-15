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

interface RenameItem extends SelectionItem {
	row: RenamePlanRow;
}

const STATUS_BADGE: Record<RenameStatus, string | undefined> = {
	ready: undefined,
	unchanged: "No change",
	invalid: "Invalid name",
	exists: "Already exists",
	duplicate: "Same new name",
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
		icon: row.status === "ready" ? "arrow-right" : changed ? "alert-triangle" : "file",
		badge: STATUS_BADGE[row.status],
		row,
	};
}

/**
 * Rename selector: the input is a `find/replace` rule and the list previews every new name.
 * Only file names inside the vault change; folders and extensions stay as they are.
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
	) {
		const paths = files.map((file) => file.path).sort((a, b) => a.localeCompare(b));
		super(
			{
				placeholder: "Find/replace, e.g. _/-",
				footerText:
					paths.length === 1
						? `Renaming: ${paths[0]}`
						: `Renaming: ${paths.length} files`,
				controls: {
					plugin,
					category: "bulk-rename",
					title: "Rename selector",
					description:
						"Type find/replace to rename the selected files. Only file names change: folders and extensions stay as they are. The list previews each new name.",
					actionLabel: "Rename",
					shortcuts: [
						["Ctrl+Enter", "Rename every listed file whose name changes"],
						[
							"find/replace",
							"The first / separates the two parts; a name cannot contain /",
						],
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
		const toggle = (id: keyof RenameOptions, label: string, description: string) =>
			this.addStatusToggle({
				id,
				label,
				// Why: these switches have no shortcut yet, so a click is the only way to flip them.
				hotkey: () => null,
				description,
				value: this.options[id],
				onChange: (value) => {
					this.options = { ...this.options, [id]: value };
					this.refreshSuggestions();
				},
			});
		toggle("regex", "Regex", "Read the find part as a regular expression; $1 inserts a group");
		toggle("matchCase", "Match case", "Distinguish upper and lower case when matching");
		toggle("all", "All occurrences", "Replace every match in a name, not only the first");
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
				? `${count} of ${this.rows.length} files will be renamed`
				: `Renaming: ${this.rows.length} files`,
		);
		return this.rows.map(toItem);
	}

	override renderSuggestion(item: RenameItem, el: HTMLElement): void {
		// Why: the input is a rule, not a search, so its characters must not highlight labels.
		renderSelectionItem(item, el);
	}

	protected override async onItemActivated(_item: RenameItem, event: Event): Promise<void> {
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (!runShortcut) {
			new Notice("Press Ctrl+Enter to rename every listed file.");
			return;
		}
		await this.apply();
	}

	private async apply(): Promise<void> {
		if (this.applying) return;
		if (isBlocked(this.rows)) {
			new Notice("Fix the marked names before renaming.");
			return;
		}
		const targets = renamableRows(this.rows);
		if (targets.length === 0) {
			new Notice("No file names would change.");
			return;
		}
		this.applying = true;
		this.commitSearchHistory();
		let renamed = 0;
		const failures: string[] = [];
		// Why: rename one at a time so each rename updates links before the next starts.
		for (const row of targets) {
			const file = this.app.vault.getAbstractFileByPath(row.path);
			if (!(file instanceof TFile)) {
				failures.push(`${row.oldName}: file not found`);
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
				? `Renamed ${renamed} files`
				: `Renamed ${renamed} files, ${failures.length} failed:\n${failures.join("\n")}`,
		);
		this.close();
	}
}
