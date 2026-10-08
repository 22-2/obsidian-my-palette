import { Notice, TFile, TFolder } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";

interface FolderItem extends SelectionItem {
	path: string;
}

/** Folder picker for moving the file that was active when the command was invoked. */
export class MoveFileModal extends SelectionModal<FolderItem> {
	constructor(
		plugin: SelectorControls["plugin"],
		private readonly file: TFile,
	) {
		super(
			{
				placeholder: "Search destination folders",
				footerText: `Moving: ${file.path}`,
				controls: {
					plugin,
					category: "folder-move",
					title: "Move file",
					description:
						"Search destination folders for the current file. Restoring history only changes the folder search.",
					actionLabel: "Move to",
				},
				items: [
					{ label: "Vault root", description: "/", icon: "folder-root", path: "" },
					...plugin.app.vault
						.getAllLoadedFiles()
						.filter((entry): entry is TFolder => entry instanceof TFolder)
						.map((folder) => ({
							label: folder.name,
							description: folder.path,
							icon: "folder",
							path: folder.path,
						})),
				],
			},
			plugin.app,
		);
	}

	protected override async onItemActivated(item: FolderItem): Promise<void> {
		const destination = item.path ? `${item.path}/${this.file.name}` : this.file.name;
		if (destination === this.file.path) return this.close();
		try {
			await this.app.fileManager.renameFile(this.file, destination);
			new Notice(`Moved to ${item.path || "Vault root"}`);
			this.close();
		} catch (error) {
			this.emptyStateText = error instanceof Error ? error.message : String(error);
		}
	}
}
