import type { App } from "obsidian";
import { RecentIdStore, type RecentIdStoreLogger } from "src/shared/recentIdStore";
import { tagKey } from "src/tags/tagChoices";

export const RECENT_TAG_DATABASE_NAME = "my-palette-recent-tags";
export const MAX_RECENT_TAGS = 20;

/**
 * Recently inserted tags per vault, without `#`. Tags differing only by case
 * are one tag in Obsidian, so they share a single recent slot.
 */
export class RecentTagStore extends RecentIdStore {
	constructor(app: App, log?: RecentIdStoreLogger) {
		super(
			app,
			{
				databaseName: RECENT_TAG_DATABASE_NAME,
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
