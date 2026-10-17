import {
	DEFAULT_FILE_SORT_PRIORITIES,
	FILE_SORT_PRIORITIES,
	parseFileSortPriority,
	type FileSortPriority,
} from "src/settings/model";
import {
	extractFileMatchSignals,
	type FileMatch,
	type FileMatchSignals,
	type SortableFileEntry,
} from "src/search/file/fileMatch";
import { isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPathMatching";
import { positiveTermBranches } from "src/search/query/searchQuery";

// 既存のモジュールの公開を保つ。一致のデータモデルは比較関数の外に置くので、将来のプロバイダーが
// 並べ替えの実装を読み込まずにシグナルを作れる。
export { extractFileMatchSignals };
export type { FileMatch, FileMatchSignals, SortableFileEntry };

interface SortContext {
	query?: string;
	recent: ReadonlyMap<string, number>;
	usageScores: ReadonlyMap<string, number>;
	signalsA: FileMatchSignals;
	signalsB: FileMatchSignals;
	demotedPriorFolders: readonly string[];
}

const EMPTY_MATCH_SIGNALS: FileMatchSignals = {};
const EMPTY_USAGE_SCORES: ReadonlyMap<string, number> = new Map();

const QUERY_SORT_PRIORITIES = new Set<FileSortPriority>([
	FILE_SORT_PRIORITIES.filenamePrefixMatch,
	FILE_SORT_PRIORITIES.aliasPrefixMatch,
	FILE_SORT_PRIORITIES.filenameFuzzyMatch,
	FILE_SORT_PRIORITIES.aliasFuzzyMatch,
	FILE_SORT_PRIORITIES.tagMatch,
	FILE_SORT_PRIORITIES.matchCoverage,
	FILE_SORT_PRIORITIES.folderPathMatch,
]);

function normalized(value: string): string {
	return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function hasPrefixMatch(
	entry: SortableFileEntry,
	query: string,
	field: "filename" | "alias",
): boolean {
	// OR の各分岐は、ユーザーが意図したかもしれない1つのフレーズである。演算子と除外された項は、
	// どの名前の一部でもなく、前方一致の判定を台無しにするので含めない。
	const needles = positiveTermBranches(query).map((terms) => normalized(terms.join(" ")));
	const values = field === "filename" ? [entry.basename] : entry.aliases;
	return values.some((value) => needles.some((needle) => normalized(value).startsWith(needle)));
}

function compareNumber(a: number, b: number, order: "asc" | "desc" = "asc"): number {
	if (a === b) return 0;
	const result = a < b ? -1 : 1;
	return order === "asc" ? result : -result;
}

function compareOptionalScore(a: number | undefined, b: number | undefined): number {
	const scoreA = typeof a === "number" && Number.isFinite(a) ? a : undefined;
	const scoreB = typeof b === "number" && Number.isFinite(b) ? b : undefined;
	// 候補は別のフィールドを通じて一致することがある。この優先度が選んだフィールドに実際に一致した候補の後ろに、
	// それを置く。
	if (scoreA === undefined && scoreB === undefined) return 0;
	if (scoreA === undefined) return 1;
	if (scoreB === undefined) return -1;
	return compareNumber(scoreA, scoreB, "desc");
}

function compareContiguousMatch(a: boolean | undefined, b: boolean | undefined): number {
	// 完全なフレーズの関連度を、ユーザーが選んだあいまいなフィールドより前に保つ。
	// このメタデータを持たない古い呼び出し元は、通常の優先度の流れに残す。
	if (a === true && b !== true) return -1;
	if (b === true && a !== true) return 1;
	return 0;
}

function compareOptionalPrior(
	a: SortableFileEntry,
	b: SortableFileEntry,
	order: "asc" | "desc",
): number {
	const priorA = typeof a.prior === "number" && Number.isFinite(a.prior) ? a.prior : undefined;
	const priorB = typeof b.prior === "number" && Number.isFinite(b.prior) ? b.prior : undefined;
	// 欠けている値と null は優先度ではない。それらを最後に置くことで、ユーザーが明示した順位を保ち、
	// 注釈のないノートが消えることもないようにする。
	if (priorA === undefined && priorB === undefined) return 0;
	if (priorA === undefined) return 1;
	if (priorB === undefined) return -1;
	return compareNumber(priorA, priorB, order);
}

function compareRecent(
	a: SortableFileEntry,
	b: SortableFileEntry,
	recent: ReadonlyMap<string, number>,
): number {
	const indexA = recent.get(a.path);
	const indexB = recent.get(b.path);
	// Infinity - Infinity は NaN になり、Array#sort の結果が実行環境によって変わってしまう。
	// そのため、履歴がないものを明示的に比較し、比較関数が常に数を返すようにする。
	if (indexA === undefined && indexB === undefined) return 0;
	if (indexA === undefined) return 1;
	if (indexB === undefined) return -1;
	return indexA - indexB;
}

function compareUsage(
	a: SortableFileEntry,
	b: SortableFileEntry,
	usageScores: ReadonlyMap<string, number>,
): number {
	// 利用は、任意で上限のある手がかり。記録のないものは、ユーザーがこの優先度を明示的に選んだときだけ、
	// 記録のあるノートの後ろに残る。
	return compareOptionalScore(usageScores.get(a.path), usageScores.get(b.path));
}

function compareActivity(a: SortableFileEntry, b: SortableFileEntry, context: SortContext): number {
	// 既存の短期的な順序を先に保ち、両方の候補が同じ最近開いた状態のときだけ、永続的な集計を使う。
	return compareRecent(a, b, context.recent) || compareUsage(a, b, context.usageScores);
}

function compareFallback(a: SortableFileEntry, b: SortableFileEntry): number {
	// 最終更新日時は設定できる優先度。ユーザーがそれを省いた後に、黙って再び持ち込むことなく、
	// フォールバックは決定的なままにする。
	return a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
}

function compareAlphabetical(a: SortableFileEntry, b: SortableFileEntry, reverse = false): number {
	const result =
		a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" }) ||
		a.path.localeCompare(b.path, undefined, { sensitivity: "base" });
	return reverse ? -result : result;
}

function compareIgnored(a: SortableFileEntry, b: SortableFileEntry): number {
	// Obsidian の除外ファイルの接頭辞は、アーカイブされたノートを確認する明示的な要求なので、
	// その候補は、ずっと多い通常の集合の前に見えるべき。
	return Number(Boolean(b.ignored)) - Number(Boolean(a.ignored));
}

function comparePriority(
	priority: FileSortPriority,
	a: SortableFileEntry,
	b: SortableFileEntry,
	context: SortContext,
): number {
	switch (priority) {
		case FILE_SORT_PRIORITIES.lowerPriorFolders:
			// 選んだ位置でフォルダーを比べるので、独自の順位が @prior に頼らなくてよい。
			return (
				Number(isUserIgnoredPathWithFilters(context.demotedPriorFolders, a.path)) -
				Number(isUserIgnoredPathWithFilters(context.demotedPriorFolders, b.path))
			);
		case FILE_SORT_PRIORITIES.filenamePrefixMatch:
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query, "filename")) -
						Number(hasPrefixMatch(a, context.query, "filename"));
		case FILE_SORT_PRIORITIES.aliasPrefixMatch:
			return context.query === undefined
				? 0
				: Number(hasPrefixMatch(b, context.query, "alias")) -
						Number(hasPrefixMatch(a, context.query, "alias"));
		case FILE_SORT_PRIORITIES.filenameFuzzyMatch:
			return compareOptionalScore(
				context.signalsA.filenameScore,
				context.signalsB.filenameScore,
			);
		case FILE_SORT_PRIORITIES.aliasFuzzyMatch:
			return compareOptionalScore(context.signalsA.aliasScore, context.signalsB.aliasScore);
		case FILE_SORT_PRIORITIES.tagMatch:
			// ノートは別のフィールドを通じてクエリに一致することがある。一致するタグがないノートは、
			// タグによる明示的な寄与を持つノートの後ろに置く。
			return compareOptionalScore(
				context.signalsA.tagMatchCount,
				context.signalsB.tagMatchCount,
			);
		case FILE_SORT_PRIORITIES.matchCoverage:
			// 網羅度は選択制で設定可能。フィールドをまたぐシグナルが、ユーザーの選んだファイル名・エイリアス・
			// タグ・プロパティの優先度を迂回しないようにするため。
			return compareOptionalScore(
				context.signalsA.matchCoverage,
				context.signalsB.matchCoverage,
			);
		case FILE_SORT_PRIORITIES.folderPathMatch:
			return compareOptionalScore(
				context.signalsA.folderPathScore,
				context.signalsB.folderPathScore,
			);
		case FILE_SORT_PRIORITIES.activity:
			return compareActivity(a, b, context);
		case FILE_SORT_PRIORITIES.lastModified:
			return compareNumber(a.mtime, b.mtime, "desc");
		case FILE_SORT_PRIORITIES.aliasesCount:
			// エイリアスの数は、派生した中心性のシグナルであり、最初のエイリアスの値ではない。
			// 既定で、少数の多くエイリアスを持つノートが支配しないよう、選択制にする。
			return compareNumber(a.aliases.length, b.aliases.length, "desc");
		case FILE_SORT_PRIORITIES.alphabetical:
			return compareAlphabetical(a, b);
		case FILE_SORT_PRIORITIES.alphabeticalReverse:
			return compareAlphabetical(a, b, true);
		default: {
			const property = parseFileSortPriority(priority);
			return property?.key === "prior" ? compareOptionalPrior(a, b, property.order) : 0;
		}
	}
}

function comparePriorities(
	a: SortableFileEntry,
	b: SortableFileEntry,
	priorities: readonly FileSortPriority[],
	context: SortContext,
): number {
	for (const priority of priorities) {
		const result = comparePriority(priority, a, b, context);
		if (result !== 0) return result;
	}
	return 0;
}

export function filterNoQueryPriorities(
	priorities: readonly FileSortPriority[],
): FileSortPriority[] {
	// 一致系の優先度は、空のクエリには手がかりがない。AQS も同じルールを適用し、空の入力でも
	// プロパティと最近の優先度が働くようにする。
	return priorities.filter((priority) => !QUERY_SORT_PRIORITIES.has(priority));
}

export function sortFilesWithoutQuery<T extends SortableFileEntry>(
	entries: T[],
	recent: ReadonlyMap<string, number>,
	priorities: readonly FileSortPriority[] = DEFAULT_FILE_SORT_PRIORITIES,
	usageScores?: ReadonlyMap<string, number>,
	demotedPriorFolders: readonly string[] = [],
): T[] {
	const noQueryPriorities = filterNoQueryPriorities(priorities);
	return entries.sort(
		(a, b) =>
			compareIgnored(a, b) ||
			// 一致系の優先度は上で除いたが、共通の比較関数は、契約を統一するために
			// 明示的な空のシグナルの集合を受け取る。
			comparePriorities(a, b, noQueryPriorities, {
				recent,
				demotedPriorFolders,
				usageScores: usageScores ?? EMPTY_USAGE_SCORES,
				signalsA: EMPTY_MATCH_SIGNALS,
				signalsB: EMPTY_MATCH_SIGNALS,
			}) ||
			compareFallback(a, b),
	);
}

export function sortFileMatches<T extends SortableFileEntry>(
	matches: FileMatch<T>[],
	query: string | undefined,
	recent: ReadonlyMap<string, number>,
	priorities: readonly FileSortPriority[] = DEFAULT_FILE_SORT_PRIORITIES,
	usageScores?: ReadonlyMap<string, number>,
	demotedPriorFolders: readonly string[] = [],
): T[] {
	// 並べ替えの前に一度だけ取り出し、比較関数が安定したシグナルだけを比べるようにする。
	// Vault に一致が多いときも、互換の境界を安く保つため。
	const signalsByMatch = new Map(
		matches.map((match) => [match, extractFileMatchSignals(match)] as const),
	);
	return matches
		.sort((a, b) => {
			const signalsA = signalsByMatch.get(a);
			const signalsB = signalsByMatch.get(b);
			if (!signalsA || !signalsB) return 0;
			return (
				compareIgnored(a.obj, b.obj) ||
				compareContiguousMatch(signalsA.contiguousMatch, signalsB.contiguousMatch) ||
				comparePriorities(a.obj, b.obj, priorities, {
					query,
					recent,
					demotedPriorFolders,
					usageScores: usageScores ?? EMPTY_USAGE_SCORES,
					signalsA,
					signalsB,
				}) ||
				compareFallback(a.obj, b.obj)
			);
		})
		.map(({ obj }) => obj);
}
