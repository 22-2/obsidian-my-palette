import type { App } from "obsidian";
import { RecentIdStore, type RecentIdStoreLogger } from "src/shared/recentIdStore";
import { tagKey } from "src/tags/tagChoices";
import { DATABASE_NAMES } from "src/shared/databaseNames";

export const MAX_RECENT_TAGS = 20;

/**
 * 最近挿入したタグを保管庫ごとに保持する。`#` は含めない。大文字小文字だけが違うタグは
 * Obsidian では同じタグなので、最近使った枠を 1 つだけ共有する。
 */
export class RecentTagStore extends RecentIdStore {
	constructor(app: App, log?: RecentIdStoreLogger) {
		super(
			app,
			{
				databaseName: DATABASE_NAMES.recentTags,
				idField: "tag",
				migrationName: "recent-tags",
				maxEntries: MAX_RECENT_TAGS,
				label: "recent tags",
				dedupeKey: tagKey,
			},
			log,
		);
	}
}
