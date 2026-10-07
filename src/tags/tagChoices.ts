export interface TagChoice {
	/** Tag name without the leading `#`. */
	tag: string;
	/** Number of vault notes using the tag. */
	count: number;
	/** Already present on every target note, so it is shown but cannot be selected. */
	registered: boolean;
	/** Why the tag is ranked above ordinary usage-count order. */
	reason?: "recent" | "related";
	/** Number of related notes using the tag; only set when `reason` is `related`. */
	relatedCount?: number;
}

export interface TagChoiceSource {
	/** Vault-wide usage keyed by `#tag`, as returned by `metadataCache.getTags()`. */
	allTags: Readonly<Record<string, number>>;
	/** Tags already present on every target note, with or without `#`. */
	registeredTags: Iterable<string>;
	/** Most recently inserted tags first. */
	recentTags: readonly string[];
	/** Tags of each related note, with or without `#`. */
	relatedNoteTags: readonly (readonly string[])[];
}

// Notes with many links would otherwise mark most tags as related, which makes
// the related marker useless as a hint.
export const MAX_RELATED_TAGS = 10;

/** Tags differ only by case in Obsidian, so comparisons use one key format. */
export function tagKey(tag: string): string {
	return tag.replace(/^#/, "").toLowerCase();
}

/** Counts related notes per tag; repeated tags inside one note count once. */
export function countTagsInNotes(noteTags: readonly (readonly string[])[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const tags of noteTags) {
		for (const key of new Set(tags.map(tagKey))) {
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}
	}
	return counts;
}

/**
 * Orders candidates as recent → related → usage count, with registered tags last.
 */
export function buildTagChoices(source: TagChoiceSource): TagChoice[] {
	const registered = new Set([...source.registeredTags].map(tagKey));
	const recentIndex = new Map<string, number>();
	for (const [index, tag] of source.recentTags.entries()) {
		const key = tagKey(tag);
		if (!recentIndex.has(key)) recentIndex.set(key, index);
	}
	// Recent and registered tags are removed before taking the top entries so they
	// do not consume the limited related slots.
	const relatedCounts = new Map(
		[...countTagsInNotes(source.relatedNoteTags)]
			.filter(([key]) => !recentIndex.has(key) && !registered.has(key))
			.sort((a, b) => b[1] - a[1])
			.slice(0, MAX_RELATED_TAGS),
	);

	const ranked = Object.entries(source.allTags).map(([hashTag, count]) => {
		const tag = hashTag.replace(/^#/, "");
		const key = tagKey(tag);
		const reason: TagChoice["reason"] = recentIndex.has(key)
			? "recent"
			: relatedCounts.has(key)
				? "related"
				: undefined;
		const choice: TagChoice = { tag, count, registered: registered.has(key) };
		if (reason) choice.reason = reason;
		if (reason === "related") choice.relatedCount = relatedCounts.get(key);
		return {
			choice,
			recent: recentIndex.get(key) ?? Number.POSITIVE_INFINITY,
			related: relatedCounts.get(key) ?? 0,
		};
	});

	const rank = ({ choice }: (typeof ranked)[number]): number => {
		if (choice.registered) return 3;
		if (choice.reason === "recent") return 0;
		if (choice.reason === "related") return 1;
		return 2;
	};
	ranked.sort(
		(a, b) =>
			rank(a) - rank(b) ||
			a.recent - b.recent ||
			b.related - a.related ||
			b.choice.count - a.choice.count,
	);
	return ranked.map(({ choice }) => choice);
}
