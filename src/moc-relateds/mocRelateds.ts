import { Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
import { emptinessBadge, noteEmptiness } from "src/audit/noteEmptiness";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type MyPalettePlugin from "src/main";
import type { FileResult } from "src/palette/results";
import type { SelectionItem } from "src/ui/selectionModal";
import { MultiSelectModal, type MultiSelectCandidate } from "src/ui/MultiSelectModal";
import {
	addLinkToMocRelateds,
	relatedsLineRange,
	removeLinkFromMocRelateds,
} from "src/moc-relateds/mocRelatedsCore";
import { getVaultFullPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import {
	addCopyPathListMenuItems,
	addCopyPathMenuItems,
	copyPathListToClipboard,
	copyPathToClipboard,
} from "src/platform/pathClipboard";
import { ignoredToggleOptions } from "src/palette/ignoredToggle";
import { runResultAction, type ActionKind } from "src/palette/resultActions";
import { executePaletteResult } from "src/palette/executePaletteResult";
import { matchedMetadataPresentation } from "src/palette/resultPresentation";
import { relationPaths } from "src/shared/noteRelations";
import { isExcludedFolder } from "src/search/excludedFolders";
import { openPaletteResultInBackground } from "src/palette/backgroundResultActions";
import { addOpenMenuItems } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";

function toRelatedCandidate(
	app: App,
	result: FileResult,
	activePath: string,
	outgoing: ReadonlySet<string>,
	incoming: ReadonlySet<string>,
	removeLink: (file: TFile) => Promise<void>,
): MultiSelectCandidate<string> | undefined {
	const file = result.file;
	const path = result.vaultPath;
	if (file && file.extension !== "md") return;
	if (!file && !isUserIgnoredPath(app, path)) return;
	if (path === activePath) return;
	// Why: 片方向だけリンクされたノートも、相互リンクを完成させるために選べる。両方向にリンクされている
	// ノートだけは、挿入するものがもう残っていない。
	const ignored = isUserIgnoredPath(app, path);
	const mutual = outgoing.has(path) && incoming.has(path);
	return {
		key: path,
		value: path,
		item: {
			label: result.primary,
			description: path,
			icon: ICONS.note,
			// 名前に検索語がない一致を説明するため、一致したメタデータを表示する。
			...matchedMetadataPresentation(result.matchedTags ?? [], result.matchedKeywords ?? []),
			badge: ignored
				? t("moc.badge.excluded")
				: mutual
					? t("moc.badge.mutual")
					: outgoing.has(path)
						? t("moc.badge.outgoing")
						: incoming.has(path)
							? t("moc.badge.incoming")
							: undefined,
			value: path,
		},
		applied: mutual && !ignored,
		removal:
			file && !ignored && (outgoing.has(path) || incoming.has(path))
				? { label: t("moc.removeLink"), run: () => removeLink(file) }
				: undefined,
	};
}

function toCandidateResult(plugin: MyPalettePlugin, item: SelectionItem): FileResult | undefined {
	if (typeof item.value !== "string") return undefined;
	const vaultPath = item.value;
	const file = plugin.app.vault.getAbstractFileByPath(vaultPath);
	const ignored = isUserIgnoredPath(plugin.app, vaultPath);
	if (!(file instanceof TFile) && !ignored) return undefined;
	return {
		id: vaultPath,
		mode: "file",
		primary: item.label,
		secondary: vaultPath,
		icon: ICONS.note,
		vaultPath,
		file: file instanceof TFile ? file : undefined,
		ignored,
	};
}

async function runCandidateAction(
	plugin: MyPalettePlugin,
	result: FileResult,
	action: ActionKind,
): Promise<void> {
	const outcome = await runResultAction(plugin.app, result, action, {
		openExternalMarkdownInObsidian: plugin.settings.openExternalMarkdownInObsidian,
		openExternalMarkdown: (absolutePath, openAction) =>
			plugin.openExternalMarkdown(absolutePath, openAction),
	});
	if (outcome.close) plugin.recordFileUsage(result.vaultPath);
	if (!outcome.close && outcome.message) new Notice(outcome.message);
}

async function openCandidateInBackground(
	plugin: MyPalettePlugin,
	result: FileResult,
): Promise<void> {
	await openPaletteResultInBackground(plugin, result);
}

function populateCandidateMenu(
	plugin: MyPalettePlugin,
	item: SelectionItem,
	menu: PaletteMenu,
	close: () => void,
): void {
	const result = toCandidateResult(plugin, item);
	if (!result) return;
	addOpenMenuItems(menu, {
		open: () => {
			close();
			void runCandidateAction(plugin, result, "primary");
		},
		openInBackground: () => {
			close();
			void openCandidateInBackground(plugin, result);
		},
		openSideBySide: () => {
			close();
			void runCandidateAction(plugin, result, "vertical");
		},
		openBelow: () => {
			close();
			void runCandidateAction(plugin, result, "horizontal");
		},
	});
	addCopyPathMenuItems(
		menu,
		{
			relativePath: result.vaultPath,
			absolutePath: getVaultFullPath(plugin.app, result.vaultPath) ?? undefined,
		},
		(path) => void copyPathToClipboard(path),
	);
}

/** ノートが MOC の Relateds 項目の中からリンクしているパス。本文の別の場所のリンクは無視する。 */
async function linksInRelateds(app: App, file: TFile): Promise<Set<string>> {
	const targets = new Set<string>();
	const range = relatedsLineRange(await app.vault.cachedRead(file));
	if (!range) return targets;
	for (const link of app.metadataCache.getFileCache(file)?.links ?? []) {
		const line = link.position.start.line;
		if (line < range[0] || line >= range[1]) continue;
		const target = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (target instanceof TFile) targets.add(target.path);
	}
	return targets;
}

/**
 * MOC が Relateds に挙げているノート(発リンク)と、自身の Relateds に MOC を挙げているノート
 * (被リンク)。挿入と削除が編集するのはこれだけなので、
 * 本文の別のリンクを既存の関係として表示してはいけない。
 */
async function relatedsRelations(
	app: App,
	mocFile: TFile,
): Promise<{ outgoing: Set<string>; incoming: Set<string> }> {
	const outgoing = await linksInRelateds(app, mocFile);
	const incoming = new Set<string>();
	// MOC にリンクしているノートだけが Relateds に MOC を挙げうるので、それだけを読む。
	for (const path of relationPaths(app, mocFile).incoming) {
		const file = app.vault.getFileByPath(path);
		if (file && (await linksInRelateds(app, file)).has(mocFile.path)) incoming.add(path);
	}
	return { outgoing, incoming };
}

/**
 * MOC 挿入と MOC 削除のセレクターが共有する基底。相互オプションで、
 * ノート自身の MOC へのリンクも変えるかどうかを選ぶ。両方のコマンドで同じ挙動にそろえるため。
 */
abstract class MocRelatedsModal extends MultiSelectModal<string> {
	/** 設定を持つ。相互のショートカットも含む。 */
	protected abstract readonly plugin: MyPalettePlugin;

	/** ノートの MOC へのリンクも、MOC のノートへのリンクと一緒に更新するかどうか。 */
	mutual = true;

	protected override onSelectionModalOpen(): void {
		super.onSelectionModalOpen();
		this.addSwitch({
			id: "mutual",
			label: t("moc.mutual.label"),
			icon: ICONS.mutualLinks,
			description: t("moc.mutual.description"),
			value: this.mutual,
			onChange: (value) => {
				this.mutual = value;
			},
		});
	}
}

/** アクティブな MOC の MOC 挿入セレクター。リンク済みのノートは右クリックメニューから削除できる。 */
class MocTargetModal extends MocRelatedsModal {
	private relations?: ReturnType<typeof relatedsRelations>;
	private includeIgnored = false;

	constructor(
		protected readonly plugin: MyPalettePlugin,
		private readonly activeFile: TFile,
	) {
		super(
			{
				// このセレクターはアクティブな MOC にリンクするノートを選ぶので、挿入先を説明する。
				placeholder: t("moc.placeholder.insert"),
				contextLabel: t("view.source", { source: activeFile.path }),
				actionLabel: t("moc.action.insert"),
				controls: {
					plugin,
					category: "moc-insertion",
					title: t("moc.controls.insertTitle"),
					description: t("moc.controls.insertDescription"),
					actionLabel: t("moc.action.insert"),
					shortcuts: [
						["→", t("moc.shortcut.preview")],
						["Space", t("moc.shortcut.toggle")],
						["Ctrl+Enter", t("moc.shortcut.apply")],
					],
				},
			},
			plugin.app,
		);
	}

	protected override onSelectionModalOpen(): void {
		// 「Obsidian の除外ファイル」オプションは、メインのパレットと同じく最初に置く。
		this.addSwitch(
			ignoredToggleOptions(this.includeIgnored, (value) => {
				this.includeIgnored = value;
				this.refreshSuggestions();
			}),
		);
		super.onSelectionModalOpen();
	}

	protected async searchCandidates(input: string): Promise<MultiSelectCandidate<string>[]> {
		const { plugin, activeFile } = this;
		// Relateds のリンクを見つけるにはリンク先のノートを開く必要があるので、最初の検索で一度だけ読む。
		this.relations ??= relatedsRelations(plugin.app, activeFile);
		const relations = await this.relations;
		// このセレクターにはモードがないので、入力全体をファイルの検索として扱う。
		const { includeIgnored } = this;
		const results = await plugin.fileProvider.search({
			mode: "file",
			query: input,
			includeIgnored,
		});
		return results
			.filter(
				(result) =>
					includeIgnored ||
					(!result.ignored &&
						!isUserIgnoredPath(plugin.app, result.vaultPath) &&
						!isExcludedFolder(
							() => plugin.settings.file.excludedFolders,
							result.vaultPath,
						)),
			)
			.map((result) =>
				toRelatedCandidate(
					plugin.app,
					result,
					activeFile.path,
					relations.outgoing,
					relations.incoming,
					(file) => this.removeLink(file),
				),
			)
			.filter(
				(candidate): candidate is MultiSelectCandidate<string> => candidate !== undefined,
			);
	}

	protected override populateSelectionMenu(
		menu: PaletteMenu,
		selected: readonly MultiSelectCandidate<string>[],
		close: () => void,
	): void {
		if (selected.length === 1) {
			populateCandidateMenu(this.plugin, selected[0].item, menu, close);
			return;
		}
		// Why: 複数選択では開くべき1つのノートがないので、選んだすべてのパスに働く操作を出す。
		// パレット自身のメニューと同じく、そうする。
		addCopyPathListMenuItems(
			menu,
			selected.map(({ value, item }) => ({
				fileName: item.label,
				relativePath: value,
				absolutePath: getVaultFullPath(this.plugin.app, value) ?? undefined,
			})),
			(values) => void copyPathListToClipboard(values),
		);
	}

	protected override handlesSuggestionPreview(): boolean {
		return true;
	}

	protected override async onSuggestionPreview(
		candidate: MultiSelectCandidate<string>,
	): Promise<void> {
		const result = toCandidateResult(this.plugin, candidate.item);
		if (!result) {
			new Notice(t("moc.fileGone"));
			return;
		}
		await executePaletteResult(this.plugin, result, "primary", {
			closeWhenDone: false,
			active: true,
			autoFocus: false,
			close: () => this.close(),
			showError: (message) => new Notice(message),
		});
	}

	/** メタデータキャッシュは編集に遅れるため、表示中の関係をその場で更新する。 */
	private async removeLink(file: TFile): Promise<void> {
		if (!(await removeFileFromMocRelateds(this.plugin, this.activeFile, file))) return;
		const relations = await this.relations;
		relations?.outgoing.delete(file.path);
		relations?.incoming.delete(file.path);
	}
}

async function resolveInsertTarget(
	plugin: MyPalettePlugin,
	path: string,
): Promise<TFile | undefined> {
	const file = plugin.app.vault.getAbstractFileByPath(path);
	if (file instanceof TFile && !isUserIgnoredPath(plugin.app, path)) return file;
	try {
		return await materializeIgnoredNote(plugin.app, path);
	} catch (error) {
		logger.error("Failed to import Obsidian-excluded file", error);
		new Notice(error instanceof Error ? error.message : t("moc.failedImport"));
		return undefined;
	}
}

async function addLink(app: App, mocFile: TFile, fileToLink: TFile): Promise<void> {
	try {
		const content = await app.vault.read(mocFile);
		const tabSize = Number(app.vault.getConfig("tabSize")) || 4;
		const result = addLinkToMocRelateds(content, fileToLink.basename, tabSize);
		if (result.success) {
			await app.vault.modify(mocFile, result.newContent);
			new Notice(t("moc.added", { moc: mocFile.basename, file: fileToLink.basename }));
		} else if (result.message === t("moc.core.alreadyExists")) {
			new Notice(
				t("moc.alreadyLinked", { moc: mocFile.basename, file: fileToLink.basename }),
			);
		} else {
			new Notice(t("moc.prefixed", { moc: mocFile.basename, message: result.message }));
		}
	} catch (error) {
		logger.error("Failed to insert link to MOC", error);
		new Notice(t("moc.insertFailed"));
	}
}

async function removeLink(
	app: App,
	note: TFile,
	linkedFile: TFile,
): Promise<"removed" | "missing" | "failed"> {
	try {
		const result = removeLinkFromMocRelateds(await app.vault.read(note), linkedFile.basename);
		if (result.success) {
			await app.vault.modify(note, result.newContent);
			return "removed";
		}
		if (result.message === t("moc.core.notFound")) return "missing";
		new Notice(t("moc.prefixed", { moc: note.basename, message: result.message }));
		return "failed";
	} catch (error) {
		logger.error("Failed to remove link from MOC", error);
		new Notice(t("moc.removeFailed"));
		return "failed";
	}
}

/**
 * MOC とノートの間の Relateds のリンクを削除する。1つでも削除したら true を返す。
 * `mutual` が false でなければ、ノート自身から MOC へのリンクも削除する。
 */
export async function removeFileFromMocRelateds(
	plugin: MyPalettePlugin,
	mocFile: TFile,
	file: TFile,
	mutual = true,
): Promise<boolean> {
	const fromMoc = await removeLink(plugin.app, mocFile, file);
	const fromNote = mutual ? await removeLink(plugin.app, file, mocFile) : "missing";
	if (fromMoc === "removed" || fromNote === "removed") {
		new Notice(t("moc.removed", { moc: mocFile.basename, file: file.basename }));
		return true;
	}
	if (fromMoc === "missing" && fromNote === "missing")
		new Notice(t("moc.noRelatedLink", { moc: mocFile.basename, file: file.basename }));
	return false;
}

/** 既知のノートをアクティブな MOC に挿入し、既存の相互リンクの挙動を保つ。 */
export async function insertFileToActiveMocRelateds(
	plugin: MyPalettePlugin,
	fileToLink: TFile,
): Promise<void> {
	const mocFile = plugin.app.workspace.getActiveFile();
	const activeLeaf = plugin.app.workspace.getMostRecentLeaf();
	// 実際のファイルのリーフだけを開き直す。常駐のパレットがアクティブなリーフでも、
	// 元のノートは workspace.getActiveFile() で取れるため。
	const mocLeaf =
		activeLeaf && (activeLeaf.view as { file?: unknown }).file ? activeLeaf : undefined;
	await insertFileToMocRelateds(plugin, mocFile, fileToLink, mocLeaf ?? undefined);
}

/** 明示的な MOC のリーフへ挿入する。常駐のパレットが自分自身を置き換えないようにするため。 */
export async function insertFileToMocRelateds(
	plugin: MyPalettePlugin,
	mocFile: TFile | null,
	fileToLink: TFile,
	mocLeaf?: WorkspaceLeaf,
	mutual = true,
): Promise<void> {
	if (!(mocFile instanceof TFile)) {
		new Notice(t("moc.noActiveMoc"));
		return;
	}
	if (mocFile.path === fileToLink.path) {
		new Notice(t("moc.selfInsert"));
		return;
	}
	await addLink(plugin.app, mocFile, fileToLink);
	if (mutual) await addLink(plugin.app, fileToLink, mocFile);
	await mocLeaf?.openFile(mocFile);
}

/** アクティブな MOC にリンクされたノートの MOC 削除セレクター。チェックしたノートのリンクを外す。 */
class MocUnlinkModal extends MocRelatedsModal {
	constructor(
		protected readonly plugin: MyPalettePlugin,
		private readonly notes: readonly TFile[],
		mocFile: TFile,
		/** 空のノート、または MOC だけを持つノートに印を付ける。Vault 監査も同じ基準で判定する。 */
		private readonly badges: ReadonlyMap<string, string | undefined> = new Map(),
	) {
		super(
			{
				placeholder: t("moc.placeholder.remove"),
				contextLabel: t("view.source", { source: mocFile.path }),
				actionLabel: t("moc.action.remove"),
				controls: {
					plugin,
					category: "moc-insertion",
					title: t("moc.controls.removeTitle"),
					description: t("moc.controls.removeDescription"),
					actionLabel: t("moc.action.remove"),
					shortcuts: [
						["Space", t("moc.shortcut.toggle")],
						["Ctrl+Enter", t("moc.shortcut.removeApply")],
					],
				},
			},
			plugin.app,
		);
	}

	protected searchCandidates(input: string): MultiSelectCandidate<string>[] {
		const needle = input.trim().toLowerCase();
		const matched = this.notes.filter(
			(file) =>
				!needle ||
				file.basename.toLowerCase().includes(needle) ||
				file.path.toLowerCase().includes(needle),
		);
		return matched.map((file) => ({
			key: file.path,
			value: file.path,
			item: {
				label: file.basename,
				description: file.path,
				value: file.path,
				badge: this.badges.get(file.path),
			},
		}));
	}
}

/** アクティブな MOC にリンクされたノートをユーザーに選ばせ、Relateds のリンクを削除する。オフにしない限り相互に削除する。 */
export async function removeLinkInMocRelateds(plugin: MyPalettePlugin): Promise<void> {
	const mocFile = plugin.app.workspace.getActiveFile();
	if (!(mocFile instanceof TFile)) {
		new Notice(t("moc.noActiveFile"));
		return;
	}

	const { outgoing, incoming } = await relatedsRelations(plugin.app, mocFile);
	const notes = [...new Set([...outgoing, ...incoming])]
		.map((path) => plugin.app.vault.getFileByPath(path))
		.filter((file): file is TFile => file !== null && file.path !== mocFile.path)
		.sort((a, b) => a.basename.localeCompare(b.basename));
	if (!notes.length) {
		new Notice(t("moc.noRelatedsToRemove", { moc: mocFile.basename }));
		return;
	}

	// Why: 空のノートが集まったハブは2通りで片付ける。書かれたノートはここでハブから外し、
	// まだ空のノートは Vault 監査からゴミ箱に送る。印で両者を区別する。
	const badges = new Map(
		await Promise.all(
			notes.map(
				async (file) =>
					[file.path, emptinessBadge(await noteEmptiness(plugin.app, file))] as const,
			),
		),
	);
	const modal = new MocUnlinkModal(plugin, notes, mocFile, badges);
	const paths = await modal.openAndWait();
	if (!paths?.length) return;
	const targets = notes.filter((file) => paths.includes(file.path));
	// Why: 削除のたびに共有の MOC を書き換えるので、対象を順番に処理して編集を保つ。
	for (const file of targets)
		await removeFileFromMocRelateds(plugin, mocFile, file, modal.mutual);
}

/** 現在のファイル一覧からノートを選び、それぞれに相互の MOC の Relateds リンクを追加する。 */
export async function insertLinkToMocRelateds(plugin: MyPalettePlugin): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!(activeFile instanceof TFile)) {
		new Notice(t("moc.noActiveFile"));
		return;
	}

	// プレビューは表示中のノートを変えるので、挿入は元の挿入先を保つ必要がある。
	const activeLeaf = plugin.app.workspace.getMostRecentLeaf();
	const mocLeaf =
		activeLeaf && (activeLeaf.view as { file?: unknown }).file ? activeLeaf : undefined;
	const modal = new MocTargetModal(plugin, activeFile);
	const changes = await modal.openAndWaitChanges();
	if (!changes || (changes.add.length === 0 && changes.remove.length === 0)) return;
	// Why: 変更のたびに共有の MOC を読んで更新するので、対象を
	// 順番に処理して、ある選択が別の選択の変更を上書きしないようにする。
	for (const path of changes.remove) {
		const file = plugin.app.vault.getFileByPath(path);
		if (file) await removeFileFromMocRelateds(plugin, activeFile, file, modal.mutual);
	}
	for (const path of changes.add) {
		// Obsidian の除外ファイルは今この時点で初めて取り込むので、キャンセルしても Vault には触れない。
		const target = await resolveInsertTarget(plugin, path);
		if (target)
			await insertFileToMocRelateds(plugin, activeFile, target, mocLeaf, modal.mutual);
	}
}
