import type { App } from "obsidian";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import {
	getSearchHistoryEntryIdentity,
	getSearchHistorySuggestions,
	normalizeSearchHistoryEntry,
	pruneStoredSearchHistory,
	recordSearchHistory,
	SEARCH_HISTORY_MAX_ENTRIES,
	type RecordSearchHistoryOptions,
} from "src/palette/searchHistory";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/model/settings";
import { getVaultId, getVaultPathKey } from "src/shared/vaultIdentity";

export const SEARCH_HISTORY_DATABASE_NAME = "my-palette-search-history";
const SEARCH_HISTORY_DATABASE_VERSION = 1;
const SEARCH_HISTORY_MIGRATION_VERSION = 1;

interface StoredSearchHistoryEntry extends SearchHistoryEntry {
	key: string;
	vaultId: string;
}

interface SearchHistoryMigration {
	key: string;
	vaultId: string;
	version: number;
	migratedAt: number;
}

interface SearchHistoryDatabase extends DBSchema {
	entries: {
		key: string;
		value: StoredSearchHistoryEntry;
		indexes: { byVault: string };
	};
	migrations: {
		key: string;
		value: SearchHistoryMigration;
	};
}

export type SearchHistoryStoreLogger = (message: string, detail?: unknown) => void;

function migrationKey(vaultId: string): string {
	return getVaultPathKey(vaultId, `search-history:${SEARCH_HISTORY_MIGRATION_VERSION}`);
}

function storedEntry(
	value: unknown,
	vaultId: string,
): { stored: StoredSearchHistoryEntry; entry: SearchHistoryEntry } | undefined {
	if (!value || typeof value !== "object") return undefined;
	const source = value as Record<string, unknown>;
	if (source.vaultId !== vaultId || typeof source.key !== "string") return undefined;
	const entry = normalizeSearchHistoryEntry(source);
	if (!entry || source.key !== getVaultPathKey(vaultId, getSearchHistoryEntryIdentity(entry)))
		return undefined;
	return { stored: source as unknown as StoredSearchHistoryEntry, entry };
}

function toStoredEntry(vaultId: string, entry: SearchHistoryEntry): StoredSearchHistoryEntry {
	return {
		...entry,
		key: getVaultPathKey(vaultId, getSearchHistoryEntryIdentity(entry)),
		vaultId,
	};
}

function sameSearchHistoryEntry(a: SearchHistoryEntry | undefined, b: SearchHistoryEntry): boolean {
	return (
		a?.input === b.input &&
		a.category === b.category &&
		Boolean(a.includeIgnored) === Boolean(b.includeIgnored) &&
		a.lastSearchedAt === b.lastSearchedAt &&
		a.count === b.count
	);
}

/**
 * Keeps search history responsive by reading IndexedDB once and queueing writes.
 * The data.json fallback remains available until the initial migration succeeds,
 * so a browser storage failure cannot erase the user's existing history.
 */
export class SearchHistoryStore {
	private readonly current = new Map<string, SearchHistoryEntry>();
	private readonly currentVaultId: string;
	private databasePromise?: Promise<IDBPDatabase<SearchHistoryDatabase>>;
	private loadPromise?: Promise<void>;
	private writePromise: Promise<void> = Promise.resolve();
	private loaded = false;
	private unavailable = false;
	private disposed = false;

	constructor(
		app: App,
		private readonly log: SearchHistoryStoreLogger = () => undefined,
	) {
		this.currentVaultId = getVaultId(app);
	}

	get isPersistent(): boolean {
		return this.loaded && !this.unavailable;
	}

	async load(
		legacyEntries: readonly SearchHistoryEntry[] = [],
		daysToKeep = 0,
	): Promise<boolean> {
		if (this.loaded) return this.isPersistent;
		this.loadPromise ??= this.loadFromDatabase(legacyEntries, daysToKeep);
		await this.loadPromise;
		return this.isPersistent;
	}

	getEntries(): readonly SearchHistoryEntry[] {
		return [...this.current.values()].map((entry) => ({ ...entry }));
	}

	getSuggestions(
		input: string,
		category: SearchHistoryCategory,
		limit = 30,
		includeIgnored = false,
	): SearchHistoryEntry[] {
		return getSearchHistorySuggestions(
			this.getEntries(),
			input,
			category,
			limit,
			includeIgnored,
		);
	}

	record(
		input: string,
		category: SearchHistoryCategory,
		options: RecordSearchHistoryOptions,
	): void {
		if (this.disposed) return;
		const before = new Map(this.current);
		const next = recordSearchHistory([...this.current.values()], input, category, options);
		this.replaceCurrent(next);

		const nextKeys = new Set(next.map((entry) => getSearchHistoryEntryIdentity(entry)));
		const changed = next.filter(
			(entry) =>
				!sameSearchHistoryEntry(before.get(getSearchHistoryEntryIdentity(entry)), entry),
		);
		const removed = [...before.keys()].filter((key) => !nextKeys.has(key));
		this.queueWrite(changed, removed);
	}

	clear(): void {
		if (this.disposed) return;
		this.current.clear();
		this.writePromise = this.writePromise
			.then(() => this.clearDatabase())
			.catch((error) => this.log("Failed to clear search history", { error }));
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		await this.loadPromise?.catch(() => undefined);
		await this.writePromise;
		if (!this.databasePromise) return;
		try {
			(await this.databasePromise).close();
		} catch {
			// Database initialization failures are optional and have already been logged.
		}
	}

	private replaceCurrent(entries: readonly SearchHistoryEntry[]): void {
		this.current.clear();
		for (const entry of entries) {
			const key = getSearchHistoryEntryIdentity(entry);
			// The newest copy wins if a legacy file contains duplicate identities.
			if (!this.current.has(key)) this.current.set(key, { ...entry });
		}
	}

	private queueWrite(changed: readonly SearchHistoryEntry[], removed: readonly string[]): void {
		if (changed.length === 0 && removed.length === 0) return;
		this.writePromise = this.writePromise
			.then(() => this.persistChanges(changed, removed))
			.catch((error) => this.log("Failed to persist search history", { error }));
	}

	private getDatabase(): Promise<IDBPDatabase<SearchHistoryDatabase>> {
		this.databasePromise ??= openDB<SearchHistoryDatabase>(
			SEARCH_HISTORY_DATABASE_NAME,
			SEARCH_HISTORY_DATABASE_VERSION,
			{
				upgrade(database) {
					if (!database.objectStoreNames.contains("entries")) {
						const store = database.createObjectStore("entries", { keyPath: "key" });
						store.createIndex("byVault", "vaultId");
					}
					if (!database.objectStoreNames.contains("migrations"))
						database.createObjectStore("migrations", { keyPath: "key" });
				},
			},
		);
		return this.databasePromise;
	}

	private async loadFromDatabase(
		legacyEntries: readonly SearchHistoryEntry[],
		daysToKeep: number,
	): Promise<void> {
		const now = Date.now();
		try {
			const database = await this.getDatabase();
			const marker = await database.get("migrations", migrationKey(this.currentVaultId));
			if (!marker) {
				const transaction = database.transaction(["entries", "migrations"], "readwrite");
				const entryStore = transaction.objectStore("entries");
				for (const entry of pruneStoredSearchHistory(
					legacyEntries,
					now,
					daysToKeep,
					SEARCH_HISTORY_MAX_ENTRIES,
				))
					await entryStore.put(toStoredEntry(this.currentVaultId, entry));
				await transaction.objectStore("migrations").put({
					key: migrationKey(this.currentVaultId),
					vaultId: this.currentVaultId,
					version: SEARCH_HISTORY_MIGRATION_VERSION,
					migratedAt: now,
				});
				await transaction.done;
			}

			const entries = await database.getAllFromIndex(
				"entries",
				"byVault",
				this.currentVaultId,
			);
			const valid = entries.flatMap((value) => {
				const normalized = storedEntry(value, this.currentVaultId);
				return normalized ? [normalized] : [];
			});
			const retainedEntries = pruneStoredSearchHistory(
				valid.map(({ entry }) => entry),
				now,
				daysToKeep,
				SEARCH_HISTORY_MAX_ENTRIES,
			);
			const retainedKeys = new Set(
				retainedEntries.map((entry) =>
					getVaultPathKey(this.currentVaultId, getSearchHistoryEntryIdentity(entry)),
				),
			);
			this.replaceCurrent(
				valid
					.filter(({ stored }) => retainedKeys.has(stored.key))
					.map(({ entry }) => entry),
			);

			const discarded = entries.filter(
				(value) => typeof value.key === "string" && !retainedKeys.has(value.key),
			);
			if (discarded.length > 0) {
				const transaction = database.transaction("entries", "readwrite");
				for (const entry of discarded) await transaction.store.delete(entry.key);
				await transaction.done;
			}
		} catch (error) {
			this.unavailable = true;
			this.replaceCurrent(
				pruneStoredSearchHistory(
					legacyEntries,
					now,
					daysToKeep,
					SEARCH_HISTORY_MAX_ENTRIES,
				),
			);
			this.log("Search history IndexedDB is unavailable", { error });
		} finally {
			this.loaded = true;
			this.log("Loaded search history", { entries: this.current.size });
		}
	}

	private async persistChanges(
		changed: readonly SearchHistoryEntry[],
		removed: readonly string[],
	): Promise<void> {
		if (!this.loaded || this.unavailable) return;
		try {
			const database = await this.getDatabase();
			const transaction = database.transaction("entries", "readwrite");
			for (const entry of changed)
				await transaction.store.put(toStoredEntry(this.currentVaultId, entry));
			for (const key of removed)
				await transaction.store.delete(getVaultPathKey(this.currentVaultId, key));
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log("Failed to persist search history", { error });
		}
	}

	private async clearDatabase(): Promise<void> {
		if (!this.loaded || this.unavailable) return;
		try {
			const database = await this.getDatabase();
			const entries = await database.getAllFromIndex(
				"entries",
				"byVault",
				this.currentVaultId,
			);
			const transaction = database.transaction("entries", "readwrite");
			for (const entry of entries) await transaction.store.delete(entry.key);
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log("Failed to clear search history", { error });
		}
	}
}
