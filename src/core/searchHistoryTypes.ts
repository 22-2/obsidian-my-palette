export interface SearchHistoryEntry {
	input: string;
	category: SearchHistoryCategory;
	includeIgnored?: boolean;
	lastSearchedAt: number;
	count: number;
}

export type SelectorHistoryCategory =
	| "tag-insertion"
	| "moc-insertion"
	| "folder-move"
	| "bulk-rename"
	| "merge-target"
	| "property-value";

export type SearchHistoryCategory =
	| SelectorHistoryCategory
	| "file"
	| "command"
	| "bookmark"
	| "smart"
	| "tab"
	| "plugin"
	| "snippet"
	| "property"
	| "tag"
	| "audit"
	| "git"
	| "git-changes"
	| "everything"
	| "everything-directory"
	| "link"
	| "backlink"
	| "heading";
