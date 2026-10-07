import type { App } from "obsidian";
import { MAX_RECENT_COMMAND_IDS } from "src/settings/model";
import {
	normalizeRecentIds,
	RecentIdStore,
	type RecentIdStoreLogger,
} from "src/shared/recentIdStore";

export const RECENT_COMMAND_DATABASE_NAME = "my-palette-recent-commands";

export type RecentCommandStoreLogger = RecentIdStoreLogger;

/** Keep the legacy settings value bounded before it enters memory or IDB. */
export function normalizeRecentCommandIds(value: unknown): string[] {
	return normalizeRecentIds(value, MAX_RECENT_COMMAND_IDS);
}

/**
 * Recent command ids per vault. The database name, id field and migration
 * marker keep their original values so existing histories stay readable.
 */
export class RecentCommandStore extends RecentIdStore {
	constructor(app: App, log?: RecentCommandStoreLogger) {
		super(
			app,
			{
				databaseName: RECENT_COMMAND_DATABASE_NAME,
				idField: "commandId",
				migrationName: "recent-commands",
				maxEntries: MAX_RECENT_COMMAND_IDS,
				label: "recent commands",
			},
			log,
		);
	}
}
