import { getAllTags, Notice, parseFrontMatterTags, type App, type TFile } from "obsidian";
import { t } from "src/i18n";
import type MyPalettePlugin from "src/main";
import {
	mergeFrontmatterTags,
	removeFrontmatterTags,
	setOrDeleteFrontmatterList,
	updateFrontmatter,
} from "src/shared/frontmatter";
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
 * 各タグを持つ対象ノートの数を、フロントマターのタグだけで数える。
 * 挿入はフロントマターに書くため、インラインのタグがあっても
 * フロントマターへの追加を妨げないように、インラインのタグは数えない。
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
		// すべての対象が持つタグだけを登録済みとする。
		// そうすると、まだ持っていないノートについては選択可能なままになる。
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
 * 追加するタグと、適用済みのタグのうち削除するものを選んでもらい、両方を対象ノートすべての
 * フロントマターに書き込む。変更を適用したら true、キャンセルまたは何も選ばなかったら false を返す。
 * 呼び出し元が元の場所へ戻れるように、結果を返す。
 */
export async function insertTags(
	plugin: MyPalettePlugin,
	files: readonly TFile[],
): Promise<boolean> {
	const { app, recentTagStore: recentTags } = plugin;
	const targets = files.filter((file) => file.extension === "md");
	if (targets.length === 0) {
		new Notice(t("tag.notice.noMarkdown"));
		return false;
	}

	const changes = await new TagSelectionModal(
		plugin,
		buildChoices(app, targets, recentTags),
		targetLabel(targets),
		targets.length,
		(tag) => removeTag(app, targets, tag),
	).openAndWaitChanges();
	if (!changes || (changes.add.length === 0 && changes.remove.length === 0)) return false;
	await applyTagChanges(app, targets, changes, recentTags);
	return true;
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
		const saved = await updateFrontmatter(app, file, "update tags of", (frontmatter) => {
			let tags = frontmatter.tags;
			if (changes.add.length > 0) tags = mergeFrontmatterTags(tags, changes.add);
			if (removals.length > 0) tags = removeFrontmatterTags(tags, removals);
			setOrDeleteFrontmatterList(frontmatter, "tags", Array.isArray(tags) ? tags : []);
		});
		if (saved) {
			updated += 1;
		} else {
			failed += 1;
		}
	}
	if (changes.add.length > 0) recentTags.record(...changes.add);

	if (updated > 0)
		new Notice(
			tagChangeMessage(
				changes,
				targets.length === 1 ? targets[0].basename : t("tag.noteCount", { count: updated }),
			),
		);
	if (failed > 0) new Notice(t("tag.notice.updateFailed", { count: failed }));
}

function hasTag(tags: readonly string[], tag: string): boolean {
	return tags.some((existing) => tagKey(existing) === tagKey(tag));
}

function tagChangeMessage(changes: MultiSelectChanges<string>, where: string): string {
	const tagsOf = (tags: readonly string[]) => tags.map((tag) => `#${tag}`).join(" ");
	if (changes.remove.length === 0)
		return t("tag.notice.added", { where, tags: tagsOf(changes.add) });
	if (changes.add.length === 0)
		return t("tag.notice.removed", { where, tags: tagsOf(changes.remove) });
	return t("tag.notice.addedAndRemoved", {
		where,
		added: tagsOf(changes.add),
		removed: tagsOf(changes.remove),
	});
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
		// 編集前に読む。キャッシュはまだ編集前のノートの状態を表しているため。
		const inline = app.metadataCache
			.getFileCache(file)
			?.tags?.some((entry) => tagKey(entry.tag) === key);
		const saved = await updateFrontmatter(app, file, "remove tag from", (frontmatter) => {
			const rest = removeFrontmatterTags(frontmatter.tags, [tag]);
			setOrDeleteFrontmatterList(frontmatter, "tags", rest);
		});
		if (saved) {
			removal.removed += 1;
			if (!inline) removal.noLongerUsed += 1;
		} else {
			failed += 1;
		}
	}
	if (removal.removed > 0)
		new Notice(t("tag.notice.removedFromNotes", { count: removal.removed, tag: `#${tag}` }));
	else if (failed === 0) new Notice(t("tag.notice.notInFrontmatter", { tag: `#${tag}` }));
	if (failed > 0) new Notice(t("tag.notice.removeFailed", { count: failed, tag: `#${tag}` }));
	return removal.removed > 0 ? removal : undefined;
}
