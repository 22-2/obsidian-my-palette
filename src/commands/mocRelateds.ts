import { Menu, Notice, TFile, type App, type WorkspaceLeaf } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { FileResult } from "src/model/results";
import { openSelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { addLinkToMocRelateds } from "src/commands/mocRelatedsCore";
import { getVaultFullPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import { addCopyPathMenuItems, copyPathToClipboard } from "src/platform/pathClipboard";
import { isMarkdownPath } from "src/shared/externalFiles";
import { parseInput } from "src/palette/inputParser";
import { runResultAction, type ActionKind } from "src/palette/resultActions";

interface RelatedCandidate {
	path: string;
	label: string;
	badge?: string;
	ignored: boolean;
}

function toRelatedCandidate(
	app: App,
	result: FileResult,
	activePath: string,
	outgoing: ReadonlySet<string>,
	incoming: ReadonlySet<string>,
): RelatedCandidate | undefined {
	const file = result.file;
	const path = result.vaultPath;
	if (file && file.extension !== "md") return;
	if (!file && !isUserIgnoredPath(app, path)) return;
	if (path === activePath || (outgoing.has(path) && incoming.has(path))) return;
	const ignored = isUserIgnoredPath(app, path);
	return {
		path,
		label: result.primary,
		ignored,
		badge: ignored
			? "Ignored · Import"
			: outgoing.has(path) && incoming.has(path)
				? "Mutual link exists"
				: outgoing.has(path)
					? "Outgoing link exists"
					: incoming.has(path)
						? "Backlink exists"
						: undefined,
	};
}

function relationPaths(
	app: App,
	activeFile: TFile,
): {
	outgoing: Set<string>;
	incoming: Set<string>;
} {
	const outgoing = new Set<string>();
	for (const link of app.metadataCache.getFileCache(activeFile)?.links ?? []) {
		const file = app.metadataCache.getFirstLinkpathDest(link.link, activeFile.path);
		if (file instanceof TFile) outgoing.add(file.path);
	}

	const incoming = new Set<string>();
	for (const path of app.metadataCache.getBacklinksForFile(activeFile)?.data?.keys() ?? []) {
		incoming.add(path);
	}
	return { outgoing, incoming };
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
		icon: "file-text",
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
	if (result.ignored) {
		const absolutePath = getVaultFullPath(plugin.app, result.vaultPath);
		if (!absolutePath) {
			new Notice("This vault adapter cannot resolve an absolute path.");
			return;
		}
		if (isMarkdownPath(absolutePath) && plugin.settings.openExternalMarkdownInObsidian) {
			await plugin.openExternalMarkdown(absolutePath, "primary", true, false);
			plugin.recordFileUsage(result.vaultPath);
			return;
		}
		new Notice("This item cannot be opened in a background Obsidian tab.");
		return;
	}
	if (result.file) {
		await plugin.app.workspace.getLeaf("tab").openFile(result.file, { active: false });
		plugin.recordFileUsage(result.vaultPath);
		return;
	}
	new Notice("The file no longer exists.");
}

function showCandidateMenu(
	plugin: MyPalettePlugin,
	item: SelectionItem,
	event: MouseEvent,
	close: () => void,
): void {
	const result = toCandidateResult(plugin, item);
	if (!result) return;
	const menu = new Menu();
	menu.addItem((menuItem) =>
		menuItem
			.setTitle("Open")
			.setIcon("external-link")
			.onClick(() => {
				close();
				void runCandidateAction(plugin, result, "primary");
			}),
	);
	menu.addItem((menuItem) =>
		menuItem
			.setTitle("Open in new tab (background)")
			.setIcon("panel-top-open")
			.onClick(() => {
				close();
				void openCandidateInBackground(plugin, result);
			}),
	);
	menu.addItem((menuItem) =>
		menuItem
			.setTitle("Open side by side")
			.setIcon("separator-vertical")
			.onClick(() => {
				close();
				void runCandidateAction(plugin, result, "vertical");
			}),
	);
	menu.addItem((menuItem) =>
		menuItem
			.setTitle("Open below")
			.setIcon("separator-horizontal")
			.onClick(() => {
				close();
				void runCandidateAction(plugin, result, "horizontal");
			}),
	);
	addCopyPathMenuItems(
		menu,
		{
			relativePath: result.vaultPath,
			absolutePath: getVaultFullPath(plugin.app, result.vaultPath) ?? undefined,
		},
		(path) => void copyPathToClipboard(path),
	);
	menu.showAtMouseEvent(event);
}

async function openTargetFileSelector(
	plugin: MyPalettePlugin,
	activeFile: TFile,
	onChoose: (file: TFile) => void | Promise<void>,
): Promise<void> {
	const { outgoing, incoming } = relationPaths(plugin.app, activeFile);
	const searchCandidates = async (input: string): Promise<RelatedCandidate[]> => {
		const parsed = parseInput(input, plugin.settings.prefixes);
		if (parsed.mode !== "file") return [];
		// Keep MOC insertion on the same explicit-prefix path as the main palette:
		// `i ` opts into the indexed ignored-note scope even when no query follows.
		const results = await plugin.fileProvider.search({
			mode: "file",
			query: parsed.query,
			includeIgnored: parsed.includeIgnored,
		});
		return results
			.map((result) =>
				toRelatedCandidate(plugin.app, result, activeFile.path, outgoing, incoming),
			)
			.filter((candidate): candidate is RelatedCandidate => candidate !== undefined);
	};

	openSelectionModal<SelectionItem>(
		{
			search: async (input) =>
				(await searchCandidates(input)).map(({ path, label, badge }) => ({
					label,
					description: path,
					icon: "file-text",
					badge,
					value: path,
				})),
			// Explain the destination because this selector chooses the note to link into the active MOC.
			placeholder:
				"Search a note to insert into the MOC · i old notes includes Excluded files",
			footerText: `Source: ${activeFile.path}`,
		},
		plugin.app,
		async (selected) => {
			if (typeof selected.value !== "string") return;
			const selectedPath = selected.value;
			const file = plugin.app.vault.getAbstractFileByPath(selectedPath);
			if (file instanceof TFile && !isUserIgnoredPath(plugin.app, selectedPath)) {
				await onChoose(file);
				return;
			}
			try {
				const imported = await materializeIgnoredNote(plugin.app, selectedPath);
				await onChoose(imported);
			} catch (error) {
				console.error("Failed to import ignored note", error);
				new Notice(
					error instanceof Error ? error.message : "Failed to import ignored note.",
				);
			}
		},
		(item, event, close) => showCandidateMenu(plugin, item, event, close),
	);
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
		console.error("Failed to insert link to MOC", error);
		new Notice("Failed to insert a link to the MOC.");
	}
}

/** Inserts a known note into the active MOC and keeps the existing mutual-link behavior. */
export async function insertFileToActiveMocRelateds(
	plugin: MyPalettePlugin,
	fileToLink: TFile,
): Promise<void> {
	const mocFile = plugin.app.workspace.getActiveFile();
	const activeLeaf = plugin.app.workspace.activeLeaf;
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
	await addLink(plugin.app, fileToLink, mocFile);
	await mocLeaf?.openFile(mocFile);
}

/** Selects a note from the current file list and adds mutual MOC Relateds links. */
export async function insertLinkToMocRelateds(plugin: MyPalettePlugin): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!(activeFile instanceof TFile)) {
		new Notice("No active file.");
		return;
	}

	await openTargetFileSelector(plugin, activeFile, async (targetFile) => {
		await insertFileToActiveMocRelateds(plugin, targetFile);
	});
}
