import type { TFile } from "obsidian";
import fuzzysort from "fuzzysort";
import { matchingTags } from "src/search/file/fileTags";
import { positiveQueryTerms } from "src/search/query/searchQuery";
import {
	fuzzyMatchCoverage,
	hasContiguousQueryMatch,
	type FuzzyQueryFieldMatch,
} from "src/search/fuzzyQuery";

export interface SortableFileEntry {
	path: string;
	basename: string;
	aliases: string[];
	mtime: number;
	/** Vault の `prior` フロントマタープロパティを数値として解析した値。 */
	prior?: number;
	ignored?: boolean;
}

export interface FileMatchSignals {
	/** ファイル名が一致したときに、その基本名が寄与するあいまい一致のスコア。 */
	filenameScore?: number;
	/** ファイルのエイリアスが一致したときに、それが寄与するあいまい一致のスコア。 */
	aliasScore?: number;
	/** ファイルのフォルダーパスが一致したときに、それが寄与するあいまい一致のスコア。 */
	folderPathScore?: number;
	/** タグ検索を使ったとき、現在のクエリに一致したタグの数。 */
	tagMatchCount?: number;
	/** 異なる検索対象の値にまたがって一致した、クエリの文字の総数。 */
	matchCoverage?: number;
	/** 検索できるメタデータの中で、有効な AND の分岐が連続して完全に一致したかどうか。 */
	contiguousMatch?: boolean;
}

export interface FileMatch<T extends SortableFileEntry> extends FileMatchSignals {
	obj: T;
	score: number;
	/** 現在のクエリに一致したタグ。表示のために並べ替えの後も引き継ぐ。 */
	matchedTags?: string[];
	/** クエリに一致したキーワード。一致したタグと並べて表示する。 */
	matchedKeywords?: string[];
}

export interface FileSearchEntry extends SortableFileEntry {
	file?: TFile;
	keywords: string[];
	tags: string[];
	extension: string;
	text: string;
	ignored: boolean;
}

export interface FileMatchOptions {
	tagOnlyQuery: boolean;
	usesMatchCoverage: boolean;
}

// 候補の生成とシグナルの取り出しは、この記述子を共有する。項目を足したり並べ替えたりしても、
// あるフィールドのあいまい一致のスコアが、黙って別のシグナルに付くことがないように。
export function folderPath(path: string): string {
	const separator = path.lastIndexOf("/");
	return separator === -1 ? "" : path.slice(0, separator);
}

const FILE_SEARCH_FIELDS = [
	{ name: "filename", value: (entry: FileSearchEntry) => entry.basename },
	// ファイル名は独自のシグナルに残す。フォルダーの優先度が、同じ基本名を Vault 相対パス全体で
	// 二度評価してしまわないように。
	{ name: "folderPath", value: (entry: FileSearchEntry) => folderPath(entry.path) },
	{ name: "text", value: (entry: FileSearchEntry) => entry.text },
	{ name: "alias", value: (entry: FileSearchEntry) => entry.aliases.join(" ") },
	{ name: "tags", value: (entry: FileSearchEntry) => entry.tags.join(" ") },
	{ name: "keywords", value: (entry: FileSearchEntry) => entry.keywords.join(" ") },
] as const;

type FileSearchFieldName = (typeof FILE_SEARCH_FIELDS)[number]["name"];

const FILE_SEARCH_KEYS = FILE_SEARCH_FIELDS.map(({ value }) => value);
const TAG_ONLY_SEARCH_KEYS = FILE_SEARCH_FIELDS.filter(({ name }) => name === "tags").map(
	({ value }) => value,
);

export function fileSearchKeys(
	tagOnlyQuery: boolean,
): readonly ((entry: FileSearchEntry) => string)[] {
	return tagOnlyQuery ? TAG_ONLY_SEARCH_KEYS : FILE_SEARCH_KEYS;
}

function fieldScore(
	fieldScores: readonly (number | undefined)[],
	fieldName: FileSearchFieldName,
): number | undefined {
	const index = FILE_SEARCH_FIELDS.findIndex(({ name }) => name === fieldName);
	return index === -1 ? undefined : fieldScores[index];
}

/**
 * 並べ替えの境界で、平坦な一致の形を正規化する。提供元は歴史的に `score` だけを渡していたので、
 * ファイル名のフォールバックはここに残す。新しい順位のシグナルは、すべての比較関数に互換性の確認を
 * 散らさずに足せるようにする。
 */
export function extractFileMatchSignals<T extends SortableFileEntry>(
	match: FileMatch<T>,
): FileMatchSignals {
	return {
		filenameScore: Object.prototype.hasOwnProperty.call(match, "filenameScore")
			? match.filenameScore
			: match.score,
		aliasScore: Object.prototype.hasOwnProperty.call(match, "aliasScore")
			? match.aliasScore
			: undefined,
		folderPathScore: Object.prototype.hasOwnProperty.call(match, "folderPathScore")
			? match.folderPathScore
			: undefined,
		tagMatchCount: Object.prototype.hasOwnProperty.call(match, "tagMatchCount")
			? match.tagMatchCount
			: undefined,
		matchCoverage: Object.prototype.hasOwnProperty.call(match, "matchCoverage")
			? match.matchCoverage
			: undefined,
		contiguousMatch: Object.prototype.hasOwnProperty.call(match, "contiguousMatch")
			? match.contiguousMatch
			: undefined,
	};
}

/**
 * あいまい候補を、並べ替えが使うメタデータのシグナルに変換する。クエリ固有の処理をここに置くことで、
 * FileProvider は候補を組み立て、比較関数はタグの構文やあいまいなキーの互換性を知らないままでいられる。
 */
export function createFileMatch(
	match: FuzzyQueryFieldMatch<FileSearchEntry>,
	query: string,
	options: FileMatchOptions,
): FileMatch<FileSearchEntry> {
	const { obj, score, fieldScores } = match;
	const matchedTags = matchingTags(obj.tags, query);
	const terms = positiveQueryTerms(query);
	const matchedKeywords = options.tagOnlyQuery
		? []
		: obj.keywords.filter((keyword) =>
				terms.some((term) => fuzzysort.single(term, keyword) !== null),
			);
	// 互換用の `text` キーではなく、元の値を数える。`text` はファイル名・パス・別名・キーワードを
	// 繰り返すので、順位を人為的に押し上げてしまうため。
	const searchableValues = options.tagOnlyQuery
		? obj.tags
		: [obj.basename, obj.path, ...obj.aliases, ...obj.tags, ...obj.keywords];
	const contiguousMatch = hasContiguousQueryMatch(query, searchableValues);
	const matchCoverage = options.usesMatchCoverage
		? fuzzyMatchCoverage(query, searchableValues)
		: undefined;

	return {
		obj,
		score,
		filenameScore: options.tagOnlyQuery ? undefined : fieldScore(fieldScores, "filename"),
		folderPathScore: options.tagOnlyQuery ? undefined : fieldScore(fieldScores, "folderPath"),
		aliasScore: options.tagOnlyQuery ? undefined : fieldScore(fieldScores, "alias"),
		tagMatchCount: matchedTags.length,
		matchCoverage,
		contiguousMatch,
		matchedTags,
		matchedKeywords,
	};
}
