/**
 * Normalize the only frontmatter value currently used by file ordering.
 * Invalid values are treated as absent so a malformed property cannot produce
 * NaN comparisons or move an otherwise ordinary note unpredictably.
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
 * spreading such a string would split it into single characters.
 */
export function normalizeFrontmatterTags(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String);
	if (typeof value === "string") return value.split(/[,\s]+/).filter((tag) => tag.length > 0);
	return [];
}

/**
 * Add tags to a frontmatter `tags` value and return the sorted list.
 * Duplicates are compared case-insensitively and the existing spelling wins,
 * because a multi-note insertion can offer a tag that some notes already have
 * in another case, and Obsidian treats those spellings as the same tag.
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
 * Remove tags from a frontmatter `tags` value, ignoring case and a leading `#`.
 * The remaining order is kept because removing a tag is not a reason to reorder.
 */
export function removeFrontmatterTags(existing: unknown, removed: readonly string[]): string[] {
	const removedKeys = new Set(removed.map((tag) => tag.replace(/^#/, "").toLowerCase()));
	return normalizeFrontmatterTags(existing).filter(
		(tag) => !removedKeys.has(tag.replace(/^#/, "").toLowerCase()),
	);
}
