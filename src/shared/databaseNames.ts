/**
 * このプラグインが開く IndexedDB データベースの名前。接頭辞を揃え、衝突しないように一箇所にまとめている。
 * ブラウザのプロファイルに保存されるため、名前を変えると既存のデータが失われる。
 */
export const DATABASE_NAMES = {
	searchHistory: "my-palette-search-history",
	fileUsage: "my-palette-file-usage",
	recentCommands: "my-palette-recent-commands",
	recentTags: "my-palette-recent-tags",
	ignoredNotes: "my-palette-ignored-notes",
} as const;
