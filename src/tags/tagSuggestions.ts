import fuzzysort from "fuzzysort";
import { tagKey, type TagChoice } from "src/tags/tagChoices";

export type TagSuggestion = { type: "tag"; choice: TagChoice } | { type: "new"; tag: string };

// Text containing `#` or whitespace cannot form one tag, so it is not offered as new.
const VALID_NEW_TAG = /^[^\s#]+$/;

/** Removes the optional leading `#` users type out of habit. */
export function normalizeTagQuery(query: string): string {
	return query.trim().replace(/^#/, "");
}

/** Stable identity used to keep the selection and the cursor across rerenders. */
export function tagSuggestionKey(item: TagSuggestion): string {
	if (item.type === "new") return `new:${item.tag}`;
	return `tag:${item.choice.tag}`;
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
 * they are in no tag list that could bring them back.
 */
export function buildTagSuggestions(
	choices: readonly TagChoice[],
	query: string,
	checked: readonly string[] = [],
): TagSuggestion[] {
	const needle = normalizeTagQuery(query);
	const known = new Set(choices.map((choice) => tagKey(choice.tag)));
	const pendingNew = checked.filter(
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
