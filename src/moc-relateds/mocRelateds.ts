import { Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
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
	// Why: a note linked in one direction only can still be selected to complete the
	// mutual link; only a note linked both ways has nothing left to insert.
	const ignored = isUserIgnoredPath(app, path);
	const mutual = outgoing.has(path) && incoming.has(path);
	return {
		key: path,
		value: path,
		item: {
			label: result.primary,
			description: path,
			icon: ICONS.note,
			// Show matching metadata to explain hits with no query text in the name.
			...matchedMetadataPresentation(result.matchedTags ?? [], result.matchedKeywords ?? []),
			badge: ignored
				? "Obsidian-excluded · Import"
				: mutual
					? "Mutual link exists"
					: outgoing.has(path)
						? "Outgoing link exists"
						: incoming.has(path)
							? "Backlink exists"
							: undefined,
			value: path,
		},
		applied: mutual && !ignored,
		removal:
			file && !ignored && (outgoing.has(path) || incoming.has(path))
				? { label: "Remove link", run: () => removeLink(file) }
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

/** Paths a note links to from inside its MOC Relateds item, ignoring links elsewhere in the body. */
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
 * Notes the MOC lists in Relateds (outgoing) and notes listing the MOC in their
 * own Relateds (incoming). Only these are what insertion and removal edit, so
 * other body links must not show as an existing relation.
 */
async function relatedsRelations(
	app: App,
	mocFile: TFile,
): Promise<{ outgoing: Set<string>; incoming: Set<string> }> {
	const outgoing = await linksInRelateds(app, mocFile);
	const incoming = new Set<string>();
	// Only notes linking to the MOC at all can list it in Relateds, so read just those.
	for (const path of relationPaths(app, mocFile).incoming) {
		const file = app.vault.getFileByPath(path);
		if (file && (await linksInRelateds(app, file)).has(mocFile.path)) incoming.add(path);
	}
	return { outgoing, incoming };
}

/**
 * Selector base shared by the MOC insert and remove selectors. Its Mutual option chooses whether
 * the note's own link to the MOC changes too, so both commands read the same way.
 */
abstract class MocRelatedsModal extends MultiSelectModal<string> {
	/** Holds the settings, including the Mutual shortcut. */
	protected abstract readonly plugin: MyPalettePlugin;

	/** Whether the note's link to the MOC is updated along with the MOC's link to the note. */
	mutual = true;

	protected override onSelectionModalOpen(): void {
		super.onSelectionModalOpen();
		this.addSwitch({
			id: "mutual",
			label: "Mutual",
			icon: ICONS.mutualLinks,
			description: "Also update the note's link to the MOC",
			value: this.mutual,
			onChange: (value) => {
				this.mutual = value;
			},
		});
	}
}

/** MOC insert selector for the active MOC; linked notes can be removed from its context menu. */
class MocTargetModal extends MocRelatedsModal {
	private relations?: ReturnType<typeof relatedsRelations>;
	private includeIgnored = false;

	constructor(
		protected readonly plugin: MyPalettePlugin,
		private readonly activeFile: TFile,
	) {
		super(
			{
				// Explain the destination because this selector chooses the notes to link into the active MOC.
				placeholder: "Search notes to insert into the MOC",
				contextLabel: `Source: ${activeFile.path}`,
				actionLabel: "Insert",
				controls: {
					plugin,
					category: "moc-insertion",
					title: "MOC insert selector",
					description:
						"Search notes to link in the active MOC. Checked notes are linked; unchecking a note that is already linked unlinks it. Obsidian-excluded files are hidden by default; the Obsidian-excluded option includes them.",
					actionLabel: "Insert",
					shortcuts: [
						["→", "Preview the note without leaving this selector"],
						["Space", "Toggle checks in selection mode"],
						[
							"Ctrl+Enter",
							"Apply the checks: insert checked notes and unlink unchecked linked notes; with no changes, insert the selected notes",
						],
					],
				},
			},
			plugin.app,
		);
	}

	protected override onSelectionModalOpen(): void {
		// The Obsidian-excluded option comes first, matching its place in the main palette.
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
		// Read once on the first search, since linked notes must be opened to find Relateds links.
		this.relations ??= relatedsRelations(plugin.app, activeFile);
		const relations = await this.relations;
		// The selector has no modes, so the whole input is a file query.
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
		// Why: a multi-selection has no single note to open, so offer the actions that
		// work on every selected path, as the palette's own menu does.
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
			new Notice("The file no longer exists.");
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

	/** Updates the shown relations directly because the metadata cache lags behind the edit. */
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
		new Notice(
			error instanceof Error ? error.message : "Failed to import Obsidian-excluded file.",
		);
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
			new Notice(`${mocFile.basename}: added ${fileToLink.basename} to Relateds.`);
		} else if (result.message === "Link already exists.") {
			new Notice(`${mocFile.basename} already links to ${fileToLink.basename}.`);
		} else {
			new Notice(`${mocFile.basename}: ${result.message}`);
		}
	} catch (error) {
		logger.error("Failed to insert link to MOC", error);
		new Notice("Failed to insert a link to the MOC.");
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
		if (result.message === "Link not found.") return "missing";
		new Notice(`${note.basename}: ${result.message}`);
		return "failed";
	} catch (error) {
		logger.error("Failed to remove link from MOC", error);
		new Notice("Failed to remove the link.");
		return "failed";
	}
}

/**
 * Removes the Relateds links between a MOC and a note; true when any link was removed.
 * The note's own link back to the MOC is removed too unless `mutual` is false.
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
		new Notice(`${mocFile.basename}: removed ${file.basename} from Relateds.`);
		return true;
	}
	if (fromMoc === "missing" && fromNote === "missing")
		new Notice(`No Relateds link between ${mocFile.basename} and ${file.basename}.`);
	return false;
}

/** Inserts a known note into the active MOC and keeps the existing mutual-link behavior. */
export async function insertFileToActiveMocRelateds(
	plugin: MyPalettePlugin,
	fileToLink: TFile,
): Promise<void> {
	const mocFile = plugin.app.workspace.getActiveFile();
	const activeLeaf = plugin.app.workspace.getMostRecentLeaf();
	// Only reopen a real file leaf; a persistent palette can be the active leaf
	// while its source note is still available through workspace.getActiveFile().
	const mocLeaf =
		activeLeaf && (activeLeaf.view as { file?: unknown }).file ? activeLeaf : undefined;
	await insertFileToMocRelateds(plugin, mocFile, fileToLink, mocLeaf ?? undefined);
}

/** Inserts into an explicit MOC leaf so a persistent palette can never replace itself. */
export async function insertFileToMocRelateds(
	plugin: MyPalettePlugin,
	mocFile: TFile | null,
	fileToLink: TFile,
	mocLeaf?: WorkspaceLeaf,
	mutual = true,
): Promise<void> {
	if (!(mocFile instanceof TFile)) {
		new Notice("No active MOC file.");
		return;
	}
	if (mocFile.path === fileToLink.path) {
		new Notice("The active note cannot be inserted into itself.");
		return;
	}
	await addLink(plugin.app, mocFile, fileToLink);
	if (mutual) await addLink(plugin.app, fileToLink, mocFile);
	await mocLeaf?.openFile(mocFile);
}

/** MOC remove selector for notes linked with the active MOC; the checked ones are unlinked. */
class MocUnlinkModal extends MocRelatedsModal {
	constructor(
		protected readonly plugin: MyPalettePlugin,
		private readonly notes: readonly TFile[],
		mocFile: TFile,
	) {
		super(
			{
				placeholder: "Search notes to unlink from the MOC",
				contextLabel: `Source: ${mocFile.path}`,
				actionLabel: "Remove",
				controls: {
					plugin,
					category: "moc-insertion",
					title: "MOC remove selector",
					description: "Search notes linked in the active MOC's Relateds to unlink them.",
					actionLabel: "Remove",
					shortcuts: [
						["Space", "Toggle checks in selection mode"],
						[
							"Ctrl+Enter",
							"Remove all checked notes, or selected notes if none are checked",
						],
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
			item: { label: file.basename, description: file.path, value: file.path },
		}));
	}
}

/** Lets the user pick notes linked with the active MOC and removes their Relateds links, mutually unless toggled off. */
export async function removeLinkInMocRelateds(plugin: MyPalettePlugin): Promise<void> {
	const mocFile = plugin.app.workspace.getActiveFile();
	if (!(mocFile instanceof TFile)) {
		new Notice("No active file.");
		return;
	}

	const { outgoing, incoming } = await relatedsRelations(plugin.app, mocFile);
	const notes = [...new Set([...outgoing, ...incoming])]
		.map((path) => plugin.app.vault.getFileByPath(path))
		.filter((file): file is TFile => file !== null && file.path !== mocFile.path)
		.sort((a, b) => a.basename.localeCompare(b.basename));
	if (!notes.length) {
		new Notice(`${mocFile.basename}: no Relateds links to remove.`);
		return;
	}

	const modal = new MocUnlinkModal(plugin, notes, mocFile);
	const paths = await modal.openAndWait();
	if (!paths?.length) return;
	const targets = notes.filter((file) => paths.includes(file.path));
	// Why: each removal rewrites the shared MOC, so process targets serially to keep edits.
	for (const file of targets)
		await removeFileFromMocRelateds(plugin, mocFile, file, modal.mutual);
}

/** Selects notes from the current file list and adds mutual MOC Relateds links to each. */
export async function insertLinkToMocRelateds(plugin: MyPalettePlugin): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!(activeFile instanceof TFile)) {
		new Notice("No active file.");
		return;
	}

	// Preview changes the visible note; insertion must keep the original destination.
	const activeLeaf = plugin.app.workspace.getMostRecentLeaf();
	const mocLeaf =
		activeLeaf && (activeLeaf.view as { file?: unknown }).file ? activeLeaf : undefined;
	const modal = new MocTargetModal(plugin, activeFile);
	const changes = await modal.openAndWaitChanges();
	if (!changes || (changes.add.length === 0 && changes.remove.length === 0)) return;
	// Why: each change reads and updates the shared MOC, so process targets
	// serially to keep one selection from overwriting another's changes.
	for (const path of changes.remove) {
		const file = plugin.app.vault.getFileByPath(path);
		if (file) await removeFileFromMocRelateds(plugin, activeFile, file, modal.mutual);
	}
	for (const path of changes.add) {
		// Obsidian-excluded files are imported only now, so cancelling never touches the vault.
		const target = await resolveInsertTarget(plugin, path);
		if (target)
			await insertFileToMocRelateds(plugin, activeFile, target, mocLeaf, modal.mutual);
	}
}
