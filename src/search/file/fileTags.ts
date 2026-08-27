import fuzzysort from "fuzzysort";

function queryTerms(query: string): string[] {
	return query.split("|").flatMap((branch) => branch.trim().split(/\s+/).filter(Boolean));
}

function normalizedTag(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed === "#") return undefined;
	return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * Keep inline and frontmatter tags in one display/search format. Obsidian can
 * expose frontmatter values without the hash, while cached inline tags include
 * it, so normalizing at the index boundary prevents duplicate behaviors.
 */
export function normalizeTags(values: readonly unknown[]): string[] {
	const tags: string[] = [];
	for (const value of values.flatMap((item) => (Array.isArray(item) ? item : [item]))) {
		const tag = normalizedTag(value);
		if (tag && !tags.includes(tag)) tags.push(tag);
	}
	return tags;
}

/**
 * A hash-prefixed query is intentionally tag-only. This lets `#project` find
 * a tagged note even when its filename and aliases do not contain "project".
 */
export function isTagOnlyQuery(query: string): boolean {
	const terms = queryTerms(query);
	return terms.length > 0 && terms.every((term) => term.startsWith("#"));
}

/**
 * Return tags that contributed to the current query for the second result row.
 * Fuzzy matching mirrors the file search, and an empty hash suffix makes `#`
 * useful as a quick way to list tagged notes.
 */
export function matchingTags(tags: readonly string[], query: string): string[] {
	const terms = queryTerms(query);
	return tags.filter((tag) =>
		terms.some((term) => {
			const needle = term.startsWith("#") ? term.slice(1) : term;
			const candidate = tag.startsWith("#") ? tag.slice(1) : tag;
			return needle.length === 0 || fuzzysort.single(needle, candidate) !== null;
		}),
	);
}
