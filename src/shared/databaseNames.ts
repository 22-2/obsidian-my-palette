/**
 * Names of the IndexedDB databases this plugin opens, kept in one place so they share a prefix
 * and never collide. They are stored in the user's browser profile: renaming one drops its data.
 */
export const DATABASE_NAMES = {
	searchHistory: "my-palette-search-history",
	fileUsage: "my-palette-file-usage",
	recentCommands: "my-palette-recent-commands",
	recentTags: "my-palette-recent-tags",
	ignoredNotes: "my-palette-ignored-notes",
} as const;
