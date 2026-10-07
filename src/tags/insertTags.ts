import { getAllTags, Notice, parseFrontMatterTags, type App, type TFile } from "obsidian";
import { mergeFrontmatterTags } from "src/shared/frontmatter";
import { relationPaths } from "src/shared/noteRelations";
import { buildTagChoices, tagKey, type TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal } from "src/tags/TagSelectionModal";

/** Recent-tag history used to rank candidates and updated after insertion. */
export interface RecentTagSource {
	getIds(): readonly string[];
	record(...tags: string[]): void;
}

function frontmatterTags(app: App, file: TFile): string[] {
	return parseFrontMatterTags(app.metadataCache.getFileCache(file)?.frontmatter) ?? [];
}

/**
 * Only frontmatter tags count as registered, because insertion writes there and
 * an inline tag does not stop the user from also adding it to frontmatter.
 * With several targets a tag is registered only when every target has it, so
 * it stays selectable for the notes that still lack it.
 */
function registeredOnEveryTarget(app: App, files: readonly TFile[]): string[] {
	const [first, ...rest] = files.map((file) => new Set(frontmatterTags(app, file).map(tagKey)));
	if (!first) return [];
	return [...first].filter((key) => rest.every((tags) => tags.has(key)));
}

/** Tags of notes linked from or to any target, excluding the targets themselves. */
function relatedNoteTags(app: App, files: readonly TFile[]): string[][] {
	const targets = new Set(files.map((file) => file.path));
	const related = new Set<string>();
	for (const file of files) {
		const { outgoing, incoming } = relationPaths(app, file);
		for (const path of [...outgoing, ...incoming]) if (!targets.has(path)) related.add(path);
	}
	return [...related].flatMap((path) => {
		const file = app.vault.getFileByPath(path);
		const cache = file ? app.metadataCache.getFileCache(file) : null;
		return cache ? [getAllTags(cache) ?? []] : [];
	});
}

function buildChoices(app: App, files: readonly TFile[], recentTags: RecentTagSource): TagChoice[] {
	return buildTagChoices({
		allTags: app.metadataCache.getTags(),
		registeredTags: registeredOnEveryTarget(app, files),
		recentTags: recentTags.getIds(),
		relatedNoteTags: relatedNoteTags(app, files),
	});
}

function targetLabel(files: readonly TFile[]): string {
	return files.length === 1 ? `Target: ${files[0].path}` : `Targets: ${files.length} notes`;
}

/**
 * Lets the user pick tags and adds them to the frontmatter of every target note.
 */
export async function insertTags(
	app: App,
	files: readonly TFile[],
	recentTags: RecentTagSource,
): Promise<void> {
	const targets = files.filter((file) => file.extension === "md");
	if (targets.length === 0) {
		new Notice("No Markdown note to add tags to.");
		return;
	}

	const selected = await new TagSelectionModal(
		app,
		buildChoices(app, targets, recentTags),
		targetLabel(targets),
	).openAndWait();
	if (!selected || selected.length === 0) return;

	let failed = 0;
	// Each note is updated on its own so one failing note does not block the rest.
	for (const file of targets) {
		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: { tags?: unknown }) => {
				frontmatter.tags = mergeFrontmatterTags(frontmatter.tags, selected);
			});
		} catch (error) {
			failed += 1;
			console.error(`Failed to add tags to ${file.path}`, error);
		}
	}
	recentTags.record(...selected);

	const tagText = selected.map((tag) => `#${tag}`).join(" ");
	const updated = targets.length - failed;
	if (updated > 0) {
		const where = targets.length === 1 ? targets[0].basename : `${updated} notes`;
		new Notice(`Added ${tagText} to ${where}.`);
	}
	if (failed > 0) new Notice(`Failed to add tags to ${failed} notes. See the console.`);
}
