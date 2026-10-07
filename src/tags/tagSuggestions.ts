import fuzzysort from "fuzzysort";
import { tagKey, type TagChoice } from "src/tags/tagChoices";

export type TagSuggestion =
	| { type: "tag"; choice: TagChoice }
	| { type: "new"; tag: string }
	| { type: "confirm"; tags: string[] };

// Text containing `#` or whitespace cannot form one tag, so it is not offered as new.
const VALID_NEW_TAG = /^[^\s#]+$/;

/** Removes the optional leading `#` users type out of habit. */
export function normalizeTagQuery(query: string): string {
	return query.trim().replace(/^#/, "");
}

/** Stable identity used to restore the cursor after rerendering suggestions. */
export function tagSuggestionKey(item: TagSuggestion): string {
	if (item.type === "confirm") return "confirm";
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
 * Builds the rows shown for the current input: matching tags, a new-tag row when
 * the input is not an existing tag, and a confirm row once something is selected.
 */
export function buildTagSuggestions(
	choices: readonly TagChoice[],
	query: string,
	selected: readonly string[],
): TagSuggestion[] {
	const needle = normalizeTagQuery(query);
	const matched = needle ? filterChoices(choices, needle) : choices;
	const suggestions: TagSuggestion[] = matched.map((choice) => ({ type: "tag", choice }));

	const exists = choices.some((choice) => tagKey(choice.tag) === tagKey(needle));
	if (needle && !exists && VALID_NEW_TAG.test(needle)) {
		suggestions.unshift({ type: "new", tag: needle });
	}

	if (selected.length > 0) {
		const confirm: TagSuggestion = { type: "confirm", tags: [...selected] };
		// Without a query the confirm row comes first so Enter can confirm immediately;
		// while searching it goes last so it does not hide the best match.
		if (needle) suggestions.push(confirm);
		else suggestions.unshift(confirm);
	}
	return suggestions;
}
