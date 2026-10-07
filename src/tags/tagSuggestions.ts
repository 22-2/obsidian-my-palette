import fuzzysort from "fuzzysort";
import { tagKey, type TagChoice } from "src/tags/tagChoices";

export type TagSuggestion = { type: "tag"; choice: TagChoice } | { type: "new"; tag: string };

// Text containing `#` or whitespace cannot form one tag, so it is not offered as new.
const VALID_NEW_TAG = /^[^\s#]+$/;

/** What the tag modal asks the caller to do with the target notes' frontmatter. */
export type TagEditAction = "add" | "remove";

/**
 * Context-menu actions for a row. Add is offered when some target still lacks
 * the tag; remove when some target has it in frontmatter. A tag on only part of
 * several targets therefore offers both.
 */
export function tagContextActions(item: TagSuggestion): TagEditAction[] {
	if (item.type === "new") return ["add"];
	const actions: TagEditAction[] = [];
	if (!item.choice.registered) actions.push("add");
	if (item.choice.present) actions.push("remove");
	return actions;
}

/** Removes the optional leading `#` users type out of habit. */
export function normalizeTagQuery(query: string): string {
	return query.trim().replace(/^#/, "");
}

/** Registered tags are listed for reference only and cannot be checked. */
export function isCheckable(item: TagSuggestion): boolean {
	return item.type === "new" || !item.choice.registered;
}

/**
 * Flip several checks as one: all become checked unless all already are, like a
 * file manager's bulk toggle, so mixed rows never end up swapped individually.
 */
export function toggleChecks(checked: ReadonlySet<string>, tags: readonly string[]): Set<string> {
	const next = new Set(checked);
	const allChecked = tags.every((tag) => checked.has(tag));
	for (const tag of tags) {
		if (allChecked) next.delete(tag);
		else next.add(tag);
	}
	return next;
}

/** Tag name a row stands for, without `#`. */
export function suggestionTag(item: TagSuggestion): string {
	return item.type === "new" ? item.tag : item.choice.tag;
}

function filterChoices(choices: readonly TagChoice[], needle: string): TagChoice[] {
	const indexes = new Map(choices.map((choice, index) => [choice, index]));
	return fuzzysort
		.go(needle, choices, { key: "tag" })
		.map((result) => ({ choice: result.obj, score: result.score }))
		.sort((a, b) => {
			// Registered tags stay last; ties keep the recent/related/count order.
			if (a.choice.registered !== b.choice.registered) return a.choice.registered ? 1 : -1;
			return b.score - a.score || (indexes.get(a.choice) ?? 0) - (indexes.get(b.choice) ?? 0);
		})
		.map(({ choice }) => choice);
}

/**
 * Builds the rows shown for the current input: new tags first, then matching
 * existing tags. Checked new tags stay listed while they match the input, because
 * the check icon is the only place that shows what is selected.
 */
export function buildTagSuggestions(
	choices: readonly TagChoice[],
	query: string,
	selected: readonly string[],
): TagSuggestion[] {
	const needle = normalizeTagQuery(query);
	const known = new Set(choices.map((choice) => tagKey(choice.tag)));
	const pendingNew = selected.filter(
		(tag) => !known.has(tagKey(tag)) && (!needle || fuzzysort.single(needle, tag) !== null),
	);
	const newTags = [...pendingNew];
	const typedIsNew =
		needle &&
		VALID_NEW_TAG.test(needle) &&
		!known.has(tagKey(needle)) &&
		!pendingNew.some((tag) => tagKey(tag) === tagKey(needle));
	if (typedIsNew) newTags.unshift(needle);

	const matched = needle ? filterChoices(choices, needle) : choices;
	return [
		...newTags.map((tag): TagSuggestion => ({ type: "new", tag })),
		...matched.map((choice): TagSuggestion => ({ type: "tag", choice })),
	];
}
