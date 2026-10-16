import { Notice, TFile, TFolder } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import { ICONS } from "src/ui/icons";

interface FolderItem extends SelectionItem {
	path: string;
}

/** An Obsidian-excluded note that is copied into the vault only once a destination is chosen. */
export interface ExcludedNoteSource {
	excludedPath: string;
}

export type MoveSource = TFile | ExcludedNoteSource;

function sourcePath(source: MoveSource): string {
	return source instanceof TFile ? source.path : source.excludedPath;
}

function isSourceList(files: MoveSource | readonly MoveSource[]): files is readonly MoveSource[] {
	return Array.isArray(files);
}

/** Folder move selector for moving one or more files into the chosen folder. */
export class MoveFileModal extends SelectionModal<FolderItem> {
	private readonly files: readonly MoveSource[];

	/** Whether any file moved, so a palette that opened this selector can close behind it. */
	private changed = false;

	constructor(
		plugin: SelectorControls["plugin"],
		files: MoveSource | readonly MoveSource[],
		private readonly onDone?: () => void,
	) {
		const targets = isSourceList(files) ? files : [files];
		super(
			{
				placeholder: "Search destination folders",
				footerText:
					targets.length === 1
						? `Moving: ${sourcePath(targets[0])}`
						: `Moving: ${targets.length} files`,
				controls: {
					plugin,
					category: "folder-move",
					title: "Folder move selector",
					description:
						"Search destination folders for the files to move. Restoring history only changes the folder search.",
					actionLabel: "Move to",
				},
				items: [
					{ label: "Vault root", description: "/", icon: ICONS.vaultRoot, path: "" },
					...plugin.app.vault
						.getAllLoadedFiles()
						.filter((entry): entry is TFolder => entry instanceof TFolder)
						.map((folder) => ({
							label: folder.name,
							description: folder.path,
							icon: ICONS.folder,
							path: folder.path,
						})),
				],
			},
			plugin.app,
		);
		this.files = targets;
	}

	protected override async onItemActivated(item: FolderItem): Promise<void> {
		const failures: string[] = [];
		let moved = 0;
		// Why: move one at a time so each rename updates links before the next starts,
		// and keep going after a failure so one name collision does not block the rest.
		for (const source of this.files) {
			const name = sourcePath(source).split("/").pop() ?? "";
			try {
				// Why: import lazily so cancelling the selector never copies anything.
				const file =
					source instanceof TFile
						? source
						: await materializeIgnoredNote(this.app, source.excludedPath);
				const destination = item.path ? `${item.path}/${file.name}` : file.name;
				if (destination === file.path) continue;
				await this.app.fileManager.renameFile(file, destination);
				moved++;
			} catch (error) {
				failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
			}
		}
		this.changed ||= moved > 0;
		const folderName = item.path || "Vault root";
		if (failures.length === 0) {
			if (moved > 0)
				new Notice(
					moved === 1
						? `Moved to ${folderName}`
						: `Moved ${moved} files to ${folderName}`,
				);
			return this.close();
		}
		if (moved > 0) new Notice(`Moved ${moved} files to ${folderName}`);
		this.emptyStateText = failures.join("\n");
	}

	protected override onSelectionModalClose(): void {
		super.onSelectionModalClose();
		if (this.changed) this.onDone?.();
	}
}
