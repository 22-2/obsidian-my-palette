import type { TFile } from "obsidian";
import { matchingTags } from "src/search/file/fileTags";
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
	/** Parsed numeric value of the Vault's `prior` frontmatter property. */
	prior?: number;
	ignored?: boolean;
}

export interface FileMatchSignals {
	/** Fuzzy score contributed by the file's basename, when it matched. */
	filenameScore?: number;
	/** Fuzzy score contributed by the file's aliases, when they matched. */
	aliasScore?: number;
	/** Fuzzy score contributed by the file's path, when it matched. */
	pathScore?: number;
	/** Number of tags that matched the current query, when tag search was used. */
	tagMatchCount?: number;
	/** Total query characters matched across distinct searchable values. */
	matchCoverage?: number;
	/** Whether a complete AND branch matched contiguously in searchable metadata. */
	contiguousMatch?: boolean;
}

export interface FileMatch<T extends SortableFileEntry> extends FileMatchSignals {
	obj: T;
	score: number;
	/** Tags that matched the current query; carried through sorting for presentation. */
	matchedTags?: string[];
}

export interface FileSearchEntry extends SortableFileEntry {
	file?: TFile;
	tags: string[];
	extension: string;
	text: string;
	ignored: boolean;
}

export interface FileMatchOptions {
	tagOnlyQuery: boolean;
	usesMatchCoverage: boolean;
}

// These positions mirror the key order in FileProvider. Naming the positions
// keeps the signal builder independent from the sorter's comparison rules.
const SEARCH_FIELD_INDEX = {
	filename: 0,
	path: 1,
	alias: 3,
} as const;

/**
 * Normalize the flat match shape at the sorter boundary. Providers historically
 * only supplied `score`, so the filename fallback must stay here while new
 * ranking signals can be added without spreading compatibility checks through
 * every comparator.
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
		pathScore: Object.prototype.hasOwnProperty.call(match, "pathScore")
			? match.pathScore
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
 * Convert a fuzzy candidate into the metadata signals consumed by the sorter.
 * Keeping query-specific work here lets FileProvider assemble candidates while
 * the comparator remains unaware of tag syntax and fuzzy-key compatibility.
 */
export function createFileMatch(
	match: FuzzyQueryFieldMatch<FileSearchEntry>,
	query: string,
	options: FileMatchOptions,
): FileMatch<FileSearchEntry> {
	const { obj, score, fieldScores } = match;
	const matchedTags = matchingTags(obj.tags, query);
	// Count source values rather than the compatibility `text` key, which repeats
	// filename, path, and aliases and would artificially boost rank.
	const searchableValues = options.tagOnlyQuery
		? obj.tags
		: [obj.basename, obj.path, ...obj.aliases, ...obj.tags];
	const contiguousMatch = hasContiguousQueryMatch(query, searchableValues);
	const matchCoverage = options.usesMatchCoverage
		? fuzzyMatchCoverage(query, searchableValues)
		: undefined;

	return {
		obj,
		score,
		filenameScore: options.tagOnlyQuery ? undefined : fieldScores[SEARCH_FIELD_INDEX.filename],
		pathScore: options.tagOnlyQuery ? undefined : fieldScores[SEARCH_FIELD_INDEX.path],
		aliasScore: options.tagOnlyQuery ? undefined : fieldScores[SEARCH_FIELD_INDEX.alias],
		tagMatchCount: matchedTags.length,
		matchCoverage,
		contiguousMatch,
		matchedTags,
	};
}
