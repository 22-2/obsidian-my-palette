import { Notice, TFolder } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { moveFiles, moveSourcePath, type MoveSource } from "src/move/moveFiles";
import { ICONS } from "src/ui/icons";
import { countLabel } from "src/core/countLabel";
import { t } from "src/i18n";

interface FolderItem extends SelectionItem {
	path: string;
}

function isSourceList(files: MoveSource | readonly MoveSource[]): files is readonly MoveSource[] {
	return Array.isArray(files);
}

/** 1つ以上のファイルを、選んだフォルダーに移動するためのフォルダー移動セレクター。 */
export class MoveFileModal extends SelectionModal<FolderItem> {
	private readonly files: readonly MoveSource[];

	/** どれかのファイルが移動したかどうか。このセレクターを開いたパレットは、その後ろで閉じられる。 */
	private changed = false;

	constructor(
		plugin: SelectorControls["plugin"],
		files: MoveSource | readonly MoveSource[],
		private readonly onDone?: () => void,
	) {
		const targets = isSourceList(files) ? files : [files];
		super(
			{
				placeholder: t("folder.placeholder"),
				footerText:
					targets.length === 1
						? t("folder.footer.moving", { path: moveSourcePath(targets[0]) })
						: t("folder.footer.movingMany", {
								what: countLabel(targets.length, "ファイル"),
							}),
				controls: {
					plugin,
					category: "folder-move",
					title: t("folder.controls.title"),
					description: t("folder.controls.description"),
					actionLabel: t("folder.action"),
				},
				items: [
					{
						label: t("folder.vaultRoot"),
						description: "/",
						icon: ICONS.vaultRoot,
						path: "",
					},
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
		const results = await moveFiles(this.app, this.files, item.path);
		const moved = results.filter((result) => result.result === "moved").length;
		const failures = results
			.filter((result) => result.result === "failed")
			.map((result) => `${result.path.split("/").pop() ?? ""}: ${result.reason}`);
		this.changed ||= moved > 0;
		const folderName = item.path || t("folder.vaultRoot");
		if (failures.length === 0) {
			if (moved > 0)
				new Notice(
					moved === 1
						? t("folder.moved", { folder: folderName })
						: t("folder.movedMany", { count: moved, folder: folderName }),
				);
			return this.close();
		}
		if (moved > 0) new Notice(t("folder.movedMany", { count: moved, folder: folderName }));
		new Notice(t("folder.moveFailed", { details: failures.join("\n") }), 10000);
	}

	protected override onSelectionModalClose(): void {
		super.onSelectionModalClose();
		if (this.changed) this.onDone?.();
	}
}
