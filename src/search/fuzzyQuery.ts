import fuzzysort from "fuzzysort";
import { foldKana } from "src/search/kana";
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
	/** 検索キーごとに1つのスコア。undefined はそのキーが寄与しなかったこと。 */
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
	// 正規化した組でスコアを付けると、引用された項もあいまい一致の項と同じ尺度になる。
	// 含まれている文字列は、常に自分自身のあいまい一致になるため。
	return fuzzysort.single(normalize(term.text), normalize(value))?.score;
}

/**
 * 除外は単純な包含で判定する。あいまい一致の `!ab` は、`a` の後に `b` が来る値のほとんどを
 * 除外してしまう。それは「ab でない」という意味ではないため。
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
 * AND は各オペランドのスコアを足し、OR は最良の代わりの候補を残す。そのため、関係のない代わりの候補が
 * 足し合わされることはない。除外は絞り込むだけで、スコアには寄与しない。
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

/** クエリに、順位付けに使える項があるかどうか。除外だけ、または何もない場合は false。 */
export function hasPositiveQueryTerms(query: string): boolean {
	return positiveTermBranches(query).length > 0;
}

/**
 * 少なくとも1つの有効な AND の分岐が、連続して完全に一致するかを判定する。これは関連度の一般的な段階。
 * 完全なメタデータのフレーズは、ユーザーがフィールド固有の優先度を先に置いただけで、
 * あいまい一致だけの候補に負けるべきではないため。
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
 * 異なる検索対象の値の中に、クエリの根拠がどれだけ現れるかを数える。各項は、一致した値ごとに
 * 文字数を1回ずつ寄与する。OR の分岐は網羅度で競わせ、関係のない代わりの候補が足し合わされることはない。
 */
export function fuzzyMatchCoverage(query: string, values: readonly string[]): number {
	const distinctValues = new Map<string, string>();
	for (const value of values) {
		const trimmed = value.trim();
		if (!trimmed) continue;
		// メタデータは、同じ別名やタグを大文字・小文字だけ違えて持つことがある。それらの表記を1つと
		// 扱い、重複したメタデータで順位が膨らまないようにする。
		const key = normalize(trimmed);
		if (!distinctValues.has(key)) distinctValues.set(key, trimmed);
	}

	return positiveTermBranches(query).reduce((bestCoverage, terms) => {
		let branchCoverage = 0;
		for (const term of terms) {
			const matchingValueCount = [...distinctValues.values()].filter(
				(value) => fuzzysort.single(term, value) !== null,
			).length;
			// 有効な AND の分岐は、どこかですべての項に一致しなければならない。ここでも同じ条件を保つと、
			// 網羅度は検索が使う分岐を表すことになる。
			if (matchingValueCount === 0) return bestCoverage;
			branchCoverage += Array.from(term.normalize("NFKC")).length * matchingValueCount;
		}
		return Math.max(bestCoverage, branchCoverage);
	}, 0);
}

export interface FuzzyQueryOptions {
	/** ひらがなとカタカナを同じ文字として扱う。クエリと検索対象の両方に同じ変換をかける。 */
	foldKana?: boolean;
}

/**
 * 検索しつつ、各キーの寄与を保持する。ファイル名とエイリアスのように、そうしないと区別できない
 * 一致を、呼び出し元が見分けるために使う。正の項がないクエリは入力の順序を保つので、除外だけが、
 * 空のクエリで呼び出し元が示す一覧を絞り込む。
 */
export function searchFuzzyQueryWithFieldScores<T>(
	query: string,
	items: readonly T[],
	keys: readonly ((item: T) => string)[],
	options: FuzzyQueryOptions = {},
): FuzzyQueryFieldMatch<T>[] {
	// Why: 変換は入口で一度だけかける。以降の照合は、クエリと値の両方が同じ形の文字列を比べる。
	const prepare = options.foldKana ? foldKana : (value: string) => value;
	const node = parseSearchQuery(prepare(query));
	if (!node)
		return items.map((obj) => ({ obj, score: 0, fieldScores: keys.map(() => undefined) }));

	return items
		.flatMap((obj) => {
			const match = matchNode(
				node,
				keys.map((key) => prepare(key(obj))),
			);
			return match ? [{ obj, ...match }] : [];
		})
		.sort((a, b) => b.score - a.score);
}

/** `src/search/query/searchQuery` に記述された、共通の検索構文を適用する。 */
export function searchFuzzyQuery<T>(
	query: string,
	items: readonly T[],
	keys: readonly ((item: T) => string)[],
	options: FuzzyQueryOptions = {},
): FuzzyQueryMatch<T>[] {
	return searchFuzzyQueryWithFieldScores(query, items, keys, options).map(({ obj, score }) => ({
		obj,
		score,
	}));
}
