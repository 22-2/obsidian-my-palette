import fuzzysort from "fuzzysort";
import {
	parseSearchQuery,
	positiveTermBranches,
	type QueryNode,
	type QueryTerm,
} from "src/search/query/searchQuery";

export interface FuzzyQueryMatch<T> {
	obj: T;
	score: number;
}

export interface FuzzyQueryFieldMatch<T> extends FuzzyQueryMatch<T> {
	/** One score per search key; undefined means that key did not contribute. */
	fieldScores: readonly (number | undefined)[];
}

interface NodeMatch {
	score: number;
	fieldScores: (number | undefined)[];
}

function normalize(value: string): string {
	return value.normalize("NFKC").toLocaleLowerCase();
}

function containsTerm(term: QueryTerm, value: string): boolean {
	return normalize(value).includes(normalize(term.text));
}

function termScore(term: QueryTerm, value: string): number | undefined {
	if (!term.exact) return fuzzysort.single(term.text, value)?.score;
	if (!containsTerm(term, value)) return undefined;
	// Scoring the normalized pair keeps quoted terms on the same scale as fuzzy
	// ones; a contained string is always a fuzzy match of itself.
	return fuzzysort.single(normalize(term.text), normalize(value))?.score;
}

/**
 * Exclusions use plain containment: a fuzzy `!ab` would reject nearly every
 * value holding an `a` before a `b`, which no one means by "not ab".
 */
function containsNode(node: QueryNode, values: readonly string[]): boolean {
	switch (node.kind) {
		case "term":
			return values.some((value) => containsTerm(node, value));
		case "not":
			return !containsNode(node.operand, values);
		case "and":
			return node.operands.every((operand) => containsNode(operand, values));
		case "or":
			return node.operands.some((operand) => containsNode(operand, values));
	}
}

function bestScore(scores: readonly (number | undefined)[]): number | undefined {
	return scores.reduce<number | undefined>(
		(best, score) =>
			score !== undefined && (best === undefined || score > best) ? score : best,
		undefined,
	);
}

/**
 * AND adds the scores of its operands and OR keeps its best alternative, so
 * unrelated alternatives never add up. An exclusion only filters and
 * contributes no score.
 */
function matchNode(node: QueryNode, values: readonly string[]): NodeMatch | undefined {
	switch (node.kind) {
		case "term": {
			const fieldScores = values.map((value) => termScore(node, value));
			const score = bestScore(fieldScores);
			return score === undefined ? undefined : { score, fieldScores };
		}
		case "not":
			return containsNode(node.operand, values)
				? undefined
				: { score: 0, fieldScores: values.map(() => undefined) };
		case "and": {
			const matches: NodeMatch[] = [];
			for (const operand of node.operands) {
				const match = matchNode(operand, values);
				if (!match) return undefined;
				matches.push(match);
			}
			return {
				score: matches.reduce((sum, { score }) => sum + score, 0),
				fieldScores: values.map((_, index) => {
					const scores = matches
						.map(({ fieldScores }) => fieldScores[index])
						.filter((score) => score !== undefined);
					return scores.length === 0
						? undefined
						: scores.reduce((sum, score) => sum + score, 0);
				}),
			};
		}
		case "or": {
			const matches = node.operands.flatMap((operand) => matchNode(operand, values) ?? []);
			if (matches.length === 0) return undefined;
			return {
				score: Math.max(...matches.map(({ score }) => score)),
				fieldScores: values.map((_, index) =>
					bestScore(matches.map(({ fieldScores }) => fieldScores[index])),
				),
			};
		}
	}
}

/** Whether the query has a term to rank by, rather than only exclusions or nothing at all. */
export function hasPositiveQueryTerms(query: string): boolean {
	return positiveTermBranches(query).length > 0;
}

/**
 * Detect a complete contiguous match for at least one valid AND branch. This
 * is a common relevance tier: an exact metadata phrase should not lose to a
 * fuzzy-only candidate just because a user placed a field-specific priority first.
 */
export function hasContiguousQueryMatch(query: string, values: readonly string[]): boolean {
	const normalizedValues = values.map(normalize);
	return positiveTermBranches(query).some((terms) =>
		terms.every((term) => {
			const normalizedTerm = normalize(term);
			return normalizedValues.some((value) => value.includes(normalizedTerm));
		}),
	);
}

/**
 * Count how much query evidence appears across distinct searchable values.
 * Each term contributes its character length once per matching value, and OR
 * branches compete by coverage so unrelated alternatives are never added together.
 */
export function fuzzyMatchCoverage(query: string, values: readonly string[]): number {
	const distinctValues = new Map<string, string>();
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		// Metadata can repeat the same alias or tag with different casing. Treating
		// those spellings as one value prevents duplicated metadata inflating rank.
		const key = normalize(trimmed);
		if (!distinctValues.has(key)) distinctValues.set(key, trimmed);
	}

	return positiveTermBranches(query).reduce((bestCoverage, terms) => {
		let branchCoverage = 0;
		for (const term of terms) {
			const matchingValueCount = [...distinctValues.values()].filter(
				(value) => fuzzysort.single(term, value) !== null,
			).length;
			// A valid AND branch must match every term somewhere. Keeping the same
			// qualification here makes coverage describe the branch used by search.
			if (matchingValueCount === 0) return bestCoverage;
			branchCoverage += Array.from(term.normalize("NFKC")).length * matchingValueCount;
		}
		return Math.max(bestCoverage, branchCoverage);
	}, 0);
}

/**
 * Search while retaining each key's contribution for callers that need to
 * distinguish otherwise identical matches, such as filenames and aliases.
 * A query without positive terms keeps the input order, so exclusions alone
 * filter the list the caller would show for an empty query.
 */
export function searchFuzzyQueryWithFieldScores<T>(
	query: string,
	items: readonly T[],
	keys: readonly ((item: T) => string)[],
): FuzzyQueryFieldMatch<T>[] {
	const node = parseSearchQuery(query);
	if (!node)
		return items.map((obj) => ({ obj, score: 0, fieldScores: keys.map(() => undefined) }));

	return items
		.flatMap((obj) => {
			const match = matchNode(
				node,
				keys.map((key) => key(obj)),
			);
			return match ? [{ obj, ...match }] : [];
		})
		.sort((a, b) => b.score - a.score);
}

/** Applies the shared search syntax described in `src/search/query/searchQuery`. */
export function searchFuzzyQuery<T>(
	query: string,
	items: readonly T[],
	keys: readonly ((item: T) => string)[],
): FuzzyQueryMatch<T>[] {
	return searchFuzzyQueryWithFieldScores(query, items, keys).map(({ obj, score }) => ({
		obj,
		score,
	}));
}
