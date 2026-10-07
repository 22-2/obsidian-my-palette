import { TFile, type App } from "obsidian";

/**
 * Collects vault paths linked from and linking to a note. Shared by MOC
 * insertion badges and related-tag ranking so both use the same notion of a
 * related note. Outgoing links come from body links only; embeds and
 * frontmatter links are deliberately not counted.
 */
export function relationPaths(
	app: App,
	file: TFile,
): {
	outgoing: Set<string>;
	incoming: Set<string>;
} {
	const outgoing = new Set<string>();
	for (const link of app.metadataCache.getFileCache(file)?.links ?? []) {
		const target = app.metadataCache.getFirstLinkpathDest(link.link, file.path);
		if (target instanceof TFile) outgoing.add(target.path);
	}

	const incoming = new Set<string>();
	for (const path of app.metadataCache.getBacklinksForFile(file)?.data?.keys() ?? []) {
		incoming.add(path);
	}
	return { outgoing, incoming };
}
