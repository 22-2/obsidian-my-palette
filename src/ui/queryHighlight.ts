import fuzzysort from "fuzzysort";
import { positiveTermBranches } from "src/search/query/searchQuery";

interface BranchHighlight {
	indexes: Set<number>;
	matchedTerms: number;
	score: number;
}

/**
 * Return label positions matched by the most informative query branch.
 * Reads the same parsed query as search, so operators and excluded terms are
 * never highlighted as if they were literal text.
 */
export function matchedQueryIndexes(text: string, query: string): readonly number[] {
	let best: BranchHighlight | undefined;
	for (const terms of positiveTermBranches(query)) {
		const matches = terms.flatMap((term) => {
			const match = fuzzysort.single(term, text);
			if (!match) return [];
			// Fuzzysort reuses its internal index buffer between calls. Snapshot the
			// positions before matching the next AND term or they will be overwritten.
			return [{ indexes: [...match.indexes], score: match.score }];
		});
		if (matches.length === 0) continue;

		const candidate: BranchHighlight = {
			indexes: new Set(matches.flatMap(({ indexes }) => indexes)),
			matchedTerms: matches.length,
			score: matches.reduce((sum, match) => sum + match.score, 0) / matches.length,
		};
		// Prefer branches that explain more of an AND query; fuzzy quality breaks
		// ties while preserving the user's left-to-right OR order as a final tie-break.
		if (
			best === undefined ||
			candidate.matchedTerms > best.matchedTerms ||
			(candidate.matchedTerms === best.matchedTerms && candidate.score > best.score)
		) {
			best = candidate;
		}
	}
	return best ? [...best.indexes].sort((a, b) => a - b) : [];
}
