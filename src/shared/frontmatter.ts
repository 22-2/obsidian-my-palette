import type { App, TFile } from "obsidian";
import { logger } from "src/shared/logger";

/** Write a frontmatter change and log any failure, so a "See the console" notice has detail. */
export async function updateFrontmatter(
	app: App,
	file: TFile,
	operation: string,
	update: (frontmatter: Record<string, unknown>) => void,
): Promise<boolean> {
	try {
		await app.fileManager.processFrontMatter(file, update);
		return true;
	} catch (error) {
		logger.error(`Failed to ${operation} ${file.path}`, error);
		return false;
	}
}

/** Store a non-empty list, or remove its key when the list is empty. */
export function setOrDeleteFrontmatterList(
	frontmatter: Record<string, unknown>,
	key: string,
	values: readonly unknown[],
): void {
	if (values.length > 0) frontmatter[key] = values;
	else delete frontmatter[key];
}

/**
 * ファイルの並び順で現在使っている唯一のフロントマター値を正規化する。
 * 不正な値は無いものとして扱い、NaN の比較を起こしたり、
 * 普通のノートの順序を予測しにくくしたりしないようにする。
 */
export function normalizeFrontmatterPrior(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Keywords are a string list; invalid elements must not become searchable text. */
export function normalizeFrontmatterKeywords(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(
			value
				.filter((item): item is string => typeof item === "string")
				.map((item) => item.trim())
				.filter(Boolean),
		),
	];
}

/**
 * Read `tags` as a list. It may be written as `tags: foo` or `tags: a, b`, and
 * 文字列を展開すると 1 文字ずつに分かれてしまうため。
 */
export function normalizeFrontmatterTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string") return value.split(/[,\s]+/).filter((tag) => tag.length > 0);
	return [];
}

/**
 * フロントマターの `tags` 値にタグを追加し、ソート済みの一覧を返す。
 * 重複は大文字小文字を区別せずに比べ、既存の表記を優先する。
 * 複数ノートへの挿入では、一部のノートが別の大文字小文字で既に持つタグを提示することがあり、
 * Obsidian はそれらを同じタグとして扱うため。
 */
export function mergeFrontmatterTags(existing: unknown, added: readonly string[]): string[] {
	const merged = new Map<string, string>();
	for (const tag of [...normalizeFrontmatterTags(existing), ...added]) {
		const key = tag.replace(/^#/, "").toLowerCase();
		if (!merged.has(key)) merged.set(key, tag);
	}
	return [...merged.values()].sort();
}

/**
 * フロントマターの `tags` 値からタグを削除する。大文字小文字と先頭の `#` は無視する。
 * タグを削除しても並び順を変える理由はないので、残りの順序は保つ。
 */
export function removeFrontmatterTags(existing: unknown, removed: readonly string[]): string[] {
	const removedKeys = new Set(removed.map((tag) => tag.replace(/^#/, "").toLowerCase()));
	return normalizeFrontmatterTags(existing).filter(
		(tag) => !removedKeys.has(tag.replace(/^#/, "").toLowerCase()),
	);
}
