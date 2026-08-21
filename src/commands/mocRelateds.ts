import { Notice, TFile, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { FileResult } from "src/model/results";
import { openSelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { addLinkToMocRelateds } from "src/commands/mocRelatedsCore";
import { isUserIgnoredPath } from "src/core/ignoredPaths";
import { materializeIgnoredNote } from "src/core/ignoredNoteMaterializer";
import { parseInput } from "src/palette/inputParser";

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

async function openTargetFileSelector(
	plugin: MyPalettePlugin,
	activeFile: TFile,
	onChoose: (file: TFile) => void | Promise<void>,
): Promise<void> {
	const { outgoing, incoming } = relationPaths(plugin.app, activeFile);
	const searchCandidates = async (input: string): Promise<RelatedCandidate[]> => {
		const parsed = parseInput(input, plugin.settings.prefixes);
		if (parsed.mode !== "file") return [];
		// An empty ignored query would materialize an unbounded list in large Vaults;
		// require a search term after the explicit opt-in prefix.
		if (parsed.includeIgnored && !parsed.query.trim()) return [];
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
			placeholder: "Search a note · i old notes includes Excluded files",
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

/** Selects a note from the current file list and adds mutual MOC Relateds links. */
export async function insertLinkToMocRelateds(plugin: MyPalettePlugin): Promise<void> {
	const activeFile = plugin.app.workspace.getActiveFile();
	if (!(activeFile instanceof TFile)) {
		new Notice("No active file.");
		return;
	}

	await openTargetFileSelector(plugin, activeFile, async (targetFile) => {
		await addLink(plugin.app, activeFile, targetFile);
		await addLink(plugin.app, targetFile, activeFile);
		await plugin.app.workspace.activeLeaf?.openFile(activeFile);
	});
}
