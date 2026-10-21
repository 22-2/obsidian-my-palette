import { parseFrontMatterAliases, parseFrontMatterTags, type App, type TFile } from "obsidian";
import { t } from "src/i18n";
import { logger } from "src/shared/logger";
import {
	deleteAliasTags,
	deleteFrontmatterTags,
	deleteInlineTags,
	isTagOrChild,
	renameAliasTags,
	renameFrontmatterTags,
	renameInlineTags,
	type InlineTagPosition,
	type RenamedList,
} from "src/tags/tagRename";

/**
 * タグの書き換え。本文とフロントマターで同じ対象の判定を使い、どのタグを対象にするかを
 * ここで決める。名前の変更と削除は、この型を作る関数が違うだけ。
 */
export interface TagEdit {
	/** タグ名（`#` なし）が対象かどうか。 */
	matches: (name: string) => boolean;
	inline: (
		text: string,
		positions: readonly InlineTagPosition[],
	) => { text: string; count: number } | undefined;
	frontmatter: (value: unknown) => RenamedList;
	aliases: (values: unknown[]) => RenamedList;
}

export function renameTagEdit(from: string, to: string): TagEdit {
	return {
		matches: (name) => isTagOrChild(name, from),
		inline: (text, positions) => renameInlineTags(text, positions, from, to),
		frontmatter: (value) => renameFrontmatterTags(value, from, to),
		aliases: (values) => renameAliasTags(values, from, to),
	};
}

/** 名前のタグを、子タグも含めてすべてのノートから消す編集。 */
export function deleteTagEdit(names: readonly string[]): TagEdit {
	return {
		matches: (name) => names.some((from) => isTagOrChild(name, from)),
		inline: (text, positions) => deleteInlineTags(text, positions, names),
		frontmatter: (value) => deleteFrontmatterTags(value, names),
		aliases: (values) => deleteAliasTags(values, names),
	};
}

/** 本文・フロントマターの `tags` / `aliases` のいずれかに、名前のどれかに当たるタグを持つノート。 */
export function findTagTargets(app: App, names: readonly string[]): TFile[] {
	const matches = (name: string) => names.some((from) => isTagOrChild(name, from));
	return app.vault.getMarkdownFiles().filter((file) => {
		const cache = app.metadataCache.getFileCache(file);
		if (!cache) return false;
		if ((cache.tags ?? []).some((tag) => matches(tag.tag.slice(1)))) return true;
		const frontmatter = cache.frontmatter;
		const tags = parseFrontMatterTags(frontmatter) ?? [];
		const aliases = (parseFrontMatterAliases(frontmatter) ?? []).filter((alias) =>
			alias.startsWith("#"),
		);
		return [...tags, ...aliases].some((tag) => matches(tag.replace(/^#/, "")));
	});
}

export function findTagRenameTargets(app: App, from: string): TFile[] {
	return findTagTargets(app, [from]);
}

export type TagRenameOutcome = "changed" | "unchanged" | "stale";

/**
 * 1つのノートの本文とフロントマターに編集を適用する。
 * 本文は読んだ位置が今も一致する場合だけ書き換え、一致しなければ何もせず stale を返す。
 * フロントマターは processFrontMatter に任せる。
 */
export async function applyTagEdit(
	app: App,
	file: TFile,
	edit: TagEdit,
): Promise<TagRenameOutcome> {
	const cache = app.metadataCache.getFileCache(file);
	const positions: InlineTagPosition[] = (cache?.tags ?? [])
		.filter((tag) => edit.matches(tag.tag.slice(1)))
		.map((tag) => ({
			tag: tag.tag,
			start: tag.position.start.offset,
			end: tag.position.end.offset,
		}));

	let stale = false;
	let inlineChanged = false;
	if (positions.length > 0) {
		await app.vault.process(file, (text) => {
			const result = edit.inline(text, positions);
			if (!result) {
				stale = true;
				return text;
			}
			inlineChanged = result.count > 0;
			return result.text;
		});
	}
	if (stale) return "stale";

	let frontmatterChanged = false;
	await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
		for (const key of ["tags", "tag"]) {
			if (!(key in frontmatter)) continue;
			const changed = writeList(frontmatter, key, edit.frontmatter(frontmatter[key]));
			frontmatterChanged = changed || frontmatterChanged;
		}
		for (const key of ["aliases", "alias"]) {
			if (!Array.isArray(frontmatter[key])) continue;
			const changed = writeList(frontmatter, key, edit.aliases(frontmatter[key]));
			frontmatterChanged = changed || frontmatterChanged;
		}
	});

	return inlineChanged || frontmatterChanged ? "changed" : "unchanged";
}

/** 結果が変わっていれば書き戻す。空になった値はキーごと消す。 */
function writeList(
	frontmatter: Record<string, unknown>,
	key: string,
	result: RenamedList,
): boolean {
	if (!result.changed) return false;
	if (result.values.length === 0) delete frontmatter[key];
	else frontmatter[key] = result.values;
	return true;
}

export function applyTagRename(
	app: App,
	file: TFile,
	from: string,
	to: string,
): Promise<TagRenameOutcome> {
	return applyTagEdit(app, file, renameTagEdit(from, to));
}

export interface TagEditSummary {
	changed: number;
	stale: number;
	failures: string[];
}

/** 各ノートに編集を1つずつ適用する。1件の失敗で残りを止めないため、例外は個別に集める。 */
export async function applyTagEditToEach(
	app: App,
	files: readonly TFile[],
	edit: TagEdit,
): Promise<TagEditSummary> {
	const summary: TagEditSummary = { changed: 0, stale: 0, failures: [] };
	for (const file of files) {
		try {
			const outcome = await applyTagEdit(app, file, edit);
			if (outcome === "changed") summary.changed++;
			if (outcome === "stale") summary.stale++;
		} catch (error) {
			logger.error(`Failed to edit tags in ${file.path}`, error);
			summary.failures.push(
				`${file.path}: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}
	return summary;
}

/** 完了の文に、読んだ後に変わったノートと失敗の注記を足す。 */
export function formatTagEditSummary(summary: TagEditSummary, doneMessage: string): string {
	const extra = [
		summary.stale > 0 ? t("tagRename.notice.stale", { count: summary.stale }) : "",
		summary.failures.length > 0
			? t("tagRename.notice.failed", { list: summary.failures.join("\n") })
			: "",
	].filter(Boolean);
	return [doneMessage, ...extra].join("\n");
}
