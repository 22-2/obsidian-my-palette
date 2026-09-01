import fuzzysort from "fuzzysort";

interface BranchHighlight {
	indexes: Set<number>;
	matchedTerms: number;
	score: number;
}

/**
 * Return label positions matched by the most informative query branch.
 * Search treats whitespace as AND and `|` as OR, so passing the raw expression
 * to fuzzysort would make both operators part of the literal search string.
 */
export function matchedQueryIndexes(text: string, query: string): readonly number[] {
	let best: BranchHighlight | undefined;
	for (const rawBranch of query.split("|")) {
		const terms = rawBranch.trim().split(/\s+/).filter(Boolean);
		if (terms.length === 0) continue;
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
