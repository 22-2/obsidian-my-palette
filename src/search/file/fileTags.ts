import fuzzysort from "fuzzysort";
import { allQueryTerms, positiveQueryTerms } from "src/search/query/searchQuery";

function normalizedTag(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed === "#") return undefined;
	return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * インラインのタグとフロントマターのタグを、1つの表示・検索の形式にそろえる。Obsidian は
 * フロントマターの値を `#` なしで出すことがあり、キャッシュされたインラインのタグは `#` を含むので、
 * 索引の境界で正規化して、同じ動作が重複しないようにする。
 */
export function normalizeTags(values: readonly unknown[]): string[] {
	const tags: string[] = [];
	for (const value of values.flatMap((item) =>
		Array.isArray(item) ? (item as unknown[]) : [item],
	)) {
		const tag = normalizedTag(value);
		if (tag && !tags.includes(tag)) tags.push(tag);
	}
	return tags;
}

/**
 * ハッシュで始まるクエリは、意図的にタグだけを検索する。これにより、`#project` は、ファイル名や
 * 別名に「project」が含まれていなくても、タグ付きのノートを見つけられる。除外された項も数える。
 * `#project !archive` は、フォルダーや名前の「archive」を意味し、それを除外できるのは
 * すべてのフィールドの検索だけだから。
 */
export function isTagOnlyQuery(query: string): boolean {
	return (
		positiveQueryTerms(query).length > 0 &&
		allQueryTerms(query).every((term) => term.startsWith("#"))
	);
}

/**
 * 2行目の結果のために、現在のクエリに寄与したタグを返す。あいまい一致はファイル検索と同じ。
 * ハッシュの後が空なら、`#` だけでタグ付きのノートを一覧にできる簡便な方法になる。
 */
export function matchingTags(
	tags: readonly string[],
	query: string,
	prepare: (value: string) => string = (value) => value,
): string[] {
	const terms = positiveQueryTerms(prepare(query));
	return tags.filter((tag) =>
		terms.some((term) => {
			const needle = term.startsWith("#") ? term.slice(1) : term;
			const candidate = prepare(tag.startsWith("#") ? tag.slice(1) : tag);
			return needle.length === 0 || fuzzysort.single(needle, candidate) !== null;
		}),
	);
}
