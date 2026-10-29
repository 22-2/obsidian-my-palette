import { Notice, TFile, TFolder } from "obsidian";
import type { SelectorControls } from "src/ui/selectorControls";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import { ICONS } from "src/ui/icons";
import { countLabel } from "src/shared/countLabel";
import { t } from "src/i18n";

interface FolderItem extends SelectionItem {
	path: string;
}

/** 移動先が選ばれるまで Vault にコピーされない、Obsidian の除外ノート。 */
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
						? t("folder.footer.moving", { path: sourcePath(targets[0]) })
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
		const failures: string[] = [];
		let moved = 0;
		// Why: 1つずつ移動して、名前の変更のたびにリンクを更新してから次を始める。
		// また、1つの名前の衝突が残りを止めないよう、失敗しても続ける。
		for (const source of this.files) {
			const name = sourcePath(source).split("/").pop() ?? "";
			try {
				// Why: 遅延して取り込むので、セレクターをキャンセルしたときに何もコピーされない。
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
