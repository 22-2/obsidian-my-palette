import type { App } from "obsidian";
import type { RecordSearchHistoryOptions } from "src/palette/searchHistory";
import { SearchHistoryStore, type SearchHistoryStoreLogger } from "src/palette/searchHistoryStore";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/settings/model";

/**
 * Search history backed by IndexedDB. When IndexedDB cannot accept the data,
 * the entries stay in memory and are mirrored to `data.json` through
 * `onLegacyChange`, so a later settings save can never erase the history.
 */
export class SearchHistoryService {
	private readonly store: SearchHistoryStore;
	private legacyEntries?: SearchHistoryEntry[];

	constructor(
		app: App,
		log: SearchHistoryStoreLogger,
		private readonly onLegacyChange: () => void,
	) {
		this.store = new SearchHistoryStore(app, log);
	}

	async load(legacyEntries: readonly SearchHistoryEntry[], daysToKeep: number): Promise<void> {
		const persistent = await this.store.load(legacyEntries, daysToKeep);
		// Keep the legacy payload in data.json only when IndexedDB cannot accept
		// the migration.
		this.legacyEntries = persistent ? undefined : [...this.store.getEntries()];
	}

	/** Entries to write to `data.json`; undefined once IndexedDB owns the history. */
	getLegacyEntries(): readonly SearchHistoryEntry[] | undefined {
		return this.legacyEntries;
	}

	getSuggestions(
		input: string,
		category: SearchHistoryCategory,
		includeIgnored = false,
	): SearchHistoryEntry[] {
		return this.store.getSuggestions(input, category, 30, includeIgnored);
	}

	record(
		input: string,
		category: SearchHistoryCategory,
		options: RecordSearchHistoryOptions,
	): void {
		this.store.record(input, category, options);
		this.syncLegacy();
	}

	clear(): void {
		this.store.clear();
		this.syncLegacy();
	}

	dispose(): Promise<void> {
		return this.store.dispose();
	}

	private syncLegacy(): void {
		if (!this.store.isPersistent) this.legacyEntries = [...this.store.getEntries()];
		if (this.legacyEntries !== undefined) this.onLegacyChange();
	}
}
