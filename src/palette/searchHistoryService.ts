import type { App } from "obsidian";
import type { RecordSearchHistoryOptions } from "src/palette/searchHistory";
import { SearchHistoryStore, type SearchHistoryStoreLogger } from "src/palette/searchHistoryStore";
import type { SearchHistoryCategory, SearchHistoryEntry } from "src/settings/model";

/**
 * IndexedDB に保存する検索履歴。IndexedDB がデータを受け付けられないときは、エントリをメモリに置き、
 * `onLegacyChange` を通じて `data.json` にも写す。そうすれば、後の設定の保存で履歴が消えることはない。
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
		// IndexedDB が移行を受け付けられないときだけ、古い内容を data.json に残す。
		this.legacyEntries = persistent ? undefined : [...this.store.getEntries()];
	}

	/** data.json に書く項目。IndexedDB が履歴を持つようになったら undefined。 */
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

	clearCategories(categories: readonly SearchHistoryCategory[]): void {
		this.store.clearCategories(categories);
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
