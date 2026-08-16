import { Notice, TFile, type App } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { FileResult } from "src/model/results";
import { showSelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { addLinkToMocRelateds } from "src/commands/mocRelatedsCore";

interface RelatedCandidate {
	file: TFile;
	description?: string;
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

async function chooseTargetFile(plugin: MyPalettePlugin, activeFile: TFile): Promise<TFile | null> {
	const { outgoing, incoming } = relationPaths(plugin.app, activeFile);
	const results = await plugin.fileProvider.search({ mode: "file", query: "" });
	const candidates: RelatedCandidate[] = results
		.map((result: FileResult) => result.file)
		.filter((file): file is TFile => file instanceof TFile && file.extension === "md")
		.filter((file) => file.path !== activeFile.path)
		.filter((file) => !(outgoing.has(file.path) && incoming.has(file.path)))
		.map((file) => ({
			file,
			description: outgoing.has(file.path)
				? "Outgoing link exists"
				: incoming.has(file.path)
					? "Backlink exists"
					: undefined,
		}));

	const selected = await showSelectionModal<SelectionItem>(
		{
			items: candidates.map(({ file, description }) => ({
				label: file.basename,
				description: description ? `${file.path} · ${description}` : file.path,
				icon: "file-text",
				value: file,
			})),
			placeholder: "Choose a note to link mutually",
			footerText: `Source: ${activeFile.path}`,
		},
		plugin.app,
	);
	return selected?.value instanceof TFile ? selected.value : null;
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

	const targetFile = await chooseTargetFile(plugin, activeFile);
	if (!targetFile) return;

	await addLink(plugin.app, activeFile, targetFile);
	await addLink(plugin.app, targetFile, activeFile);
	await plugin.app.workspace.activeLeaf?.openFile(activeFile);
}
