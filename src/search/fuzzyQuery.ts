import fuzzysort from "fuzzysort";

export interface FuzzyQueryMatch<T> {
	obj: T;
	score: number;
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
	const branches = query
		.split("|")
		.map((branch) => branch.trim().split(/\s+/).filter(Boolean))
		.filter((terms) => terms.length > 0);
	if (branches.length === 0) return items.map((obj) => ({ obj, score: 0 }));

	return items
		.flatMap((obj) => {
			const branchScores = branches.flatMap((terms) => {
				const termScores: number[] = [];
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
				}
				return [termScores.reduce((sum, score) => sum + score, 0)];
			});
			if (branchScores.length === 0) return [];
			return [{ obj, score: Math.max(...branchScores) }];
		})
		.sort((a, b) => b.score - a.score);
}
