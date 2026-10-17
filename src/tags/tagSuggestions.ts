import fuzzysort from "fuzzysort";
import { tagKey, type TagChoice } from "src/tags/tagChoices";
import { typedNewValue, type NewValueRules } from "src/shared/newValue";

export type TagSuggestion = { type: "tag"; choice: TagChoice } | { type: "new"; tag: string };

// `#` や空白を含むテキストは 1 つのタグにならないため、新規候補にはしない。
const VALID_NEW_TAG = /^[^\s#]+$/;
const TAG_VALUE_RULES: NewValueRules = {
	normalize: normalizeTagQuery,
	isValid: (tag) => VALID_NEW_TAG.test(tag),
	keyOf: tagKey,
};

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
			// 登録済みのタグは最後に置く。同順位は最近・関連・使用数の順を保つ。
			if (a.choice.registered !== b.choice.registered) return a.choice.registered ? 1 : -1;
			return b.score - a.score || (indexes.get(a.choice) ?? 0) - (indexes.get(b.choice) ?? 0);
		})
		.map(({ choice }) => choice);
}

/**
 * 現在の入力に対して表示する行を作る。新規タグを先頭にし、その後に一致する既存タグを並べる。
 * チェック済みの新規タグは、入力に一致する間は表示し続ける。
 * 他のタグ一覧には含まれないため、消すと戻す手段がないから。
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
	const typedNew = typedNewValue(
		query,
		[...choices.map((choice) => choice.tag), ...pendingNew],
		TAG_VALUE_RULES,
	);
	if (typedNew) newTags.unshift(typedNew);

	const matched = needle ? filterChoices(choices, needle) : choices;
	return [
		...newTags.map((tag): TagSuggestion => ({ type: "new", tag })),
		...matched.map((choice): TagSuggestion => ({ type: "tag", choice })),
	];
}
