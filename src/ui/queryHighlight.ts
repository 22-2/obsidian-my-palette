import fuzzysort from "fuzzysort";
import { positiveTermBranches } from "src/search/query/searchQuery";

interface BranchHighlight {
	indexes: Set<number>;
	matchedTerms: number;
	score: number;
}

/**
 * 最も情報量のあるクエリの分岐が一致させた、ラベルの位置を返す。
 * 検索と同じ解析済みのクエリを読むので、演算子や除外された語が、リテラルの文字のように強調されることはない。
 */
export function matchedQueryIndexes(text: string, query: string): readonly number[] {
	let best: BranchHighlight | undefined;
	for (const terms of positiveTermBranches(query)) {
		const matches = terms.flatMap((term) => {
			const match = fuzzysort.single(term, text);
			if (!match) return [];
			// fuzzysort は呼び出しの間で内部のインデックスの領域を使い回す。次の AND の語を一致させる前に
			// 位置を複製しておかないと、上書きされてしまう。
			return [{ indexes: [...match.indexes], score: match.score }];
		});
		if (matches.length === 0) continue;

		const candidate: BranchHighlight = {
			indexes: new Set(matches.flatMap(({ indexes }) => indexes)),
			matchedTerms: matches.length,
			score: matches.reduce((sum, match) => sum + match.score, 0) / matches.length,
		};
		// AND のクエリをより多く説明する分岐を優先する。同点はあいまい一致の品質で決め、
		// 最後はユーザーが書いた左から右の OR の順で決める。
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
