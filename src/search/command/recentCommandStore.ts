import type { App } from "obsidian";
import { MAX_RECENT_COMMAND_IDS } from "src/settings/model";
import {
	normalizeRecentIds,
	RecentIdStore,
	type RecentIdStoreLogger,
} from "src/shared/recentIdStore";
import { DATABASE_NAMES } from "src/shared/databaseNames";

export type RecentCommandStoreLogger = RecentIdStoreLogger;

/** メモリや IDB に入る前に、古い設定の値を上限のある大きさに保つ。 */
export function normalizeRecentCommandIds(value: unknown): string[] {
	return normalizeRecentIds(value, MAX_RECENT_COMMAND_IDS);
}

/**
 * Vault ごとの最近のコマンド ID。データベース名、ID のフィールド、移行のマーカーは元の値を保つので、
 * 既存の履歴が読めたままになる。
 */
export class RecentCommandStore extends RecentIdStore {
	constructor(app: App, log?: RecentCommandStoreLogger) {
		super(
			app,
			{
				databaseName: DATABASE_NAMES.recentCommands,
				idField: "commandId",
				migrationName: "recent-commands",
				maxEntries: MAX_RECENT_COMMAND_IDS,
				label: "recent commands",
			},
			log,
		);
	}
}
