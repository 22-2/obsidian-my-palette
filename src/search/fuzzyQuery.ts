import fuzzysort from "fuzzysort";

export interface FuzzyQueryMatch<T> {
	obj: T;
	score: number;
}

export interface FuzzyQueryFieldMatch<T> extends FuzzyQueryMatch<T> {
	/** One score per search key; undefined means that key did not contribute. */
	fieldScores: readonly (number | undefined)[];
}

function queryBranches(query: string): string[][] {
	return query
		.split("|")
		.map((branch) => branch.trim().split(/\s+/).filter(Boolean))
		.filter((terms) => terms.length > 0);
}

/**
 * Search while retaining each key's contribution for callers that need to
 * distinguish otherwise identical matches, such as filenames and aliases.
 */
export function searchFuzzyQueryWithFieldScores<T>(
	query: string,
	items: readonly T[],
	keys: readonly ((item: T) => string)[],
): FuzzyQueryFieldMatch<T>[] {
	const branches = queryBranches(query);
	if (branches.length === 0)
		return items.map((obj) => ({ obj, score: 0, fieldScores: keys.map(() => undefined) }));

	return items
		.flatMap((obj) => {
			const branchMatches = branches.flatMap((terms) => {
				const termScores: number[] = [];
				const fieldScores = keys.map(() => 0);
				const fieldMatched = keys.map(() => false);
				for (const term of terms) {
					const scores = keys.map((key) => fuzzysort.single(term, key(obj))?.score);
					const best = scores.reduce<number | undefined>(
						(best, score) =>
							score !== undefined && (best === undefined || score > best)
								? score
								: best,
						undefined,
					);
					if (best === undefined) return [];
					termScores.push(best);
					scores.forEach((score, index) => {
						if (score !== undefined) {
							fieldMatched[index] = true;
							fieldScores[index] += score;
						}
					});
				}
				return [
					{
						score: termScores.reduce((sum, score) => sum + score, 0),
						fieldScores: fieldScores.map((score, index) =>
							fieldMatched[index] ? score : undefined,
						),
					},
				];
			});
			if (branchMatches.length === 0) return [];
			const fieldScores = keys.map((_, index) =>
				branchMatches.reduce<number | undefined>((best, branch) => {
					const score = branch.fieldScores[index];
					return score !== undefined && (best === undefined || score > best)
						? score
						: best;
				}, undefined),
			);
			return [
				{
					obj,
					score: Math.max(...branchMatches.map(({ score }) => score)),
					fieldScores,
				},
			];
		})
		.sort((a, b) => b.score - a.score);
}

/**
 * Applies the palette's compact boolean syntax: whitespace joins terms with
 * AND, while a pipe starts an OR branch. Empty branches are ignored so a
 * partially typed pipe does not make the result list unexpectedly empty.
 */
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
