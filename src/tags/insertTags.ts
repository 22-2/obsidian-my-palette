import { getAllTags, Notice, parseFrontMatterTags, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { mergeFrontmatterTags, removeFrontmatterTags } from "src/shared/frontmatter";
import { relationPaths } from "src/shared/noteRelations";
import { buildTagChoices, tagKey, type TagChoice } from "src/tags/tagChoices";
import type { MultiSelectChanges } from "src/ui/multiSelectChanges";
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
 * Counts targets having each tag in frontmatter. Only frontmatter tags count,
 * because insertion writes there and an inline tag does not stop the user from
 * also adding it to frontmatter.
 */
function frontmatterTagCounts(app: App, files: readonly TFile[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const file of files) {
		for (const key of new Set(frontmatterTags(app, file).map(tagKey)))
			counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
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
	const appliedCounts = frontmatterTagCounts(app, files);
	return buildTagChoices({
		allTags: app.metadataCache.getTags(),
		// A tag is registered only when every target has it, so it stays selectable
		// for the notes that still lack it.
		registeredTags: [...appliedCounts]
			.filter(([, n]) => n === files.length)
			.map(([key]) => key),
		appliedCounts,
		recentTags: recentTags.getIds(),
		relatedNoteTags: relatedNoteTags(app, files),
	});
}

function targetLabel(files: readonly TFile[]): string {
	return files.length === 1 ? `Target: ${files[0].path}` : `Targets: ${files.length} notes`;
}

/**
 * Lets the user pick tags to add and applied tags to remove, then writes both to the
 * frontmatter of every target note.
 */
export async function insertTags(plugin: MyPalettePlugin, files: readonly TFile[]): Promise<void> {
	const { app, recentTagStore: recentTags } = plugin;
	const targets = files.filter((file) => file.extension === "md");
	if (targets.length === 0) {
		new Notice("No Markdown note to add tags to.");
		return;
	}

	const changes = await new TagSelectionModal(
		plugin,
		buildChoices(app, targets, recentTags),
		targetLabel(targets),
		targets.length,
		(tag) => removeTag(app, targets, tag),
	).openAndWaitChanges();
	if (!changes || (changes.add.length === 0 && changes.remove.length === 0)) return;
	await applyTagChanges(app, targets, changes, recentTags);
}

/** Writes tag changes per note, so one failing note does not block the rest. */
async function applyTagChanges(
	app: App,
	targets: readonly TFile[],
	changes: MultiSelectChanges<string>,
	recentTags: RecentTagSource,
): Promise<void> {
	let updated = 0;
	let failed = 0;
	for (const file of targets) {
		const existing = frontmatterTags(app, file);
		const removals = changes.remove.filter((tag) => hasTag(existing, tag));
		if (changes.add.length === 0 && removals.length === 0) continue;
		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: { tags?: unknown }) => {
				let tags = frontmatter.tags;
				if (changes.add.length > 0) tags = mergeFrontmatterTags(tags, changes.add);
				if (removals.length > 0) tags = removeFrontmatterTags(tags, removals);
				if (Array.isArray(tags) && tags.length > 0) frontmatter.tags = tags;
				else delete frontmatter.tags;
			});
			updated += 1;
		} catch (error) {
			failed += 1;
			console.error(`Failed to update tags of ${file.path}`, error);
		}
	}
	if (changes.add.length > 0) recentTags.record(...changes.add);

	if (updated > 0)
		new Notice(
			tagChangeMessage(
				changes,
				targets.length === 1 ? targets[0].basename : `${updated} notes`,
			),
		);
	if (failed > 0) new Notice(`Failed to update tags of ${failed} notes. See the console.`);
}

function hasTag(tags: readonly string[], tag: string): boolean {
	return tags.some((existing) => tagKey(existing) === tagKey(tag));
}

function tagChangeMessage(changes: MultiSelectChanges<string>, where: string): string {
	const tagsOf = (tags: readonly string[]) => tags.map((tag) => `#${tag}`).join(" ");
	if (changes.remove.length === 0) return `Added ${tagsOf(changes.add)} to ${where}.`;
	if (changes.add.length === 0) return `Removed ${tagsOf(changes.remove)} from ${where}.`;
	return `Added ${tagsOf(changes.add)} and removed ${tagsOf(changes.remove)} on ${where}.`;
}

/** Result of removing a tag from the targets' frontmatter. */
export interface TagRemoval {
	/** Targets whose frontmatter lost the tag. */
	removed: number;
	/** Of those, notes that no longer use the tag at all, because it is not also written inline. */
	noLongerUsed: number;
}

/** Removes a tag from the frontmatter of every target that has it; undefined when nothing was removed. */
async function removeTag(
	app: App,
	files: readonly TFile[],
	tag: string,
): Promise<TagRemoval | undefined> {
	const key = tagKey(tag);
	const removal: TagRemoval = { removed: 0, noLongerUsed: 0 };
	let failed = 0;
	for (const file of files) {
		if (!frontmatterTags(app, file).some((existing) => tagKey(existing) === key)) continue;
		// Read before editing: the cache still describes the note as it was.
		const inline = app.metadataCache
			.getFileCache(file)
			?.tags?.some((entry) => tagKey(entry.tag) === key);
		try {
			await app.fileManager.processFrontMatter(file, (frontmatter: { tags?: unknown }) => {
				const rest = removeFrontmatterTags(frontmatter.tags, [tag]);
				if (rest.length > 0) frontmatter.tags = rest;
				else delete frontmatter.tags;
			});
			removal.removed += 1;
			if (!inline) removal.noLongerUsed += 1;
		} catch (error) {
			failed += 1;
			console.error(`Failed to remove tag from ${file.path}`, error);
		}
	}
	if (removal.removed > 0)
		new Notice(
			`Removed #${tag} from ${removal.removed === 1 ? "1 note" : `${removal.removed} notes`}.`,
		);
	else if (failed === 0) new Notice(`#${tag} is not in the frontmatter of the target notes.`);
	if (failed > 0) new Notice(`Failed to remove #${tag} from ${failed} notes. See the console.`);
	return removal.removed > 0 ? removal : undefined;
}
