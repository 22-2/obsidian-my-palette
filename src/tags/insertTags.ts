import { getAllTags, Notice, parseFrontMatterTags, type App, type TFile } from "obsidian";
import { mergeFrontmatterTags, removeFrontmatterTags } from "src/shared/frontmatter";
import { relationPaths } from "src/shared/noteRelations";
import { buildTagChoices, tagKey, type TagChoice } from "src/tags/tagChoices";
import { TagSelectionModal, type TagSelectionResult } from "src/tags/TagSelectionModal";

/** Recent-tag history used to rank candidates and updated after insertion. */
export interface RecentTagSource {
	getIds(): readonly string[];
	record(...tags: string[]): void;
}

function frontmatterTags(app: App, file: TFile): string[] {
	return parseFrontMatterTags(app.metadataCache.getFileCache(file)?.frontmatter) ?? [];
}

/**
 * Only frontmatter tags count as registered or present, because insertion and
 * removal edit frontmatter and an inline tag cannot be removed from there.
 * With several targets a tag is registered only when every target has it, so
 * it stays selectable for the notes that still lack it.
 */
function targetTagKeys(
	app: App,
	files: readonly TFile[],
): { registered: string[]; present: string[] } {
	const sets = files.map((file) => new Set(frontmatterTags(app, file).map(tagKey)));
	const present = new Set(sets.flatMap((tags) => [...tags]));
	return {
		registered: [...present].filter((key) => sets.every((tags) => tags.has(key))),
		present: [...present],
	};
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
	const { registered, present } = targetTagKeys(app, files);
	return buildTagChoices({
		allTags: app.metadataCache.getTags(),
		registeredTags: registered,
		presentTags: present,
		recentTags: recentTags.getIds(),
		relatedNoteTags: relatedNoteTags(app, files),
	});
}

function targetLabel(files: readonly TFile[]): string {
	return files.length === 1 ? `Target: ${files[0].path}` : `Targets: ${files.length} notes`;
}

/**
 * Updates each note on its own so one failing note does not block the rest.
 * Returns how many notes were updated and how many failed.
 */
async function editFrontmatterTags(
	app: App,
	files: readonly TFile[],
	edit: (frontmatter: { tags?: unknown }) => void,
): Promise<{ updated: number; failed: number }> {
	let failed = 0;
	for (const file of files) {
		try {
			await app.fileManager.processFrontMatter(file, edit);
		} catch (error) {
			failed += 1;
			console.error(`Failed to edit tags of ${file.path}`, error);
		}
	}
	return { updated: files.length - failed, failed };
}

function noteCountText(files: readonly TFile[], updated: number): string {
	return files.length === 1 ? files[0].basename : `${updated} notes`;
}

async function addTags(
	app: App,
	targets: readonly TFile[],
	tags: string[],
	recentTags: RecentTagSource,
): Promise<void> {
	const { updated, failed } = await editFrontmatterTags(app, targets, (frontmatter) => {
		frontmatter.tags = mergeFrontmatterTags(frontmatter.tags, tags);
	});
	recentTags.record(...tags);
	const tagText = tags.map((tag) => `#${tag}`).join(" ");
	if (updated > 0) new Notice(`Added ${tagText} to ${noteCountText(targets, updated)}.`);
	if (failed > 0) new Notice(`Failed to add tags to ${failed} notes. See the console.`);
}

async function removeTags(app: App, targets: readonly TFile[], tags: string[]): Promise<void> {
	const keys = new Set(tags.map(tagKey));
	// Notes without the tag are left untouched so their frontmatter is not rewritten.
	const holders = targets.filter((file) =>
		frontmatterTags(app, file).some((tag) => keys.has(tagKey(tag))),
	);
	const { updated, failed } = await editFrontmatterTags(app, holders, (frontmatter) => {
		const remaining = removeFrontmatterTags(frontmatter.tags, tags);
		// An empty `tags:` key carries no information, so drop it with the last tag.
		if (remaining.length > 0) frontmatter.tags = remaining;
		else delete frontmatter.tags;
	});
	const tagText = tags.map((tag) => `#${tag}`).join(" ");
	if (updated > 0) new Notice(`Removed ${tagText} from ${noteCountText(holders, updated)}.`);
	if (failed > 0) new Notice(`Failed to remove tags from ${failed} notes. See the console.`);
}

/**
 * Lets the user pick tags and adds them to (or, from the row menu, removes one
 * from) the frontmatter of every target note.
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

	const result: TagSelectionResult | null = await new TagSelectionModal(
		app,
		buildChoices(app, targets, recentTags),
		{ label: targetLabel(targets), count: targets.length },
	).openAndWait();
	if (!result || result.tags.length === 0) return;

	if (result.action === "add") await addTags(app, targets, result.tags, recentTags);
	else await removeTags(app, targets, result.tags);
}
