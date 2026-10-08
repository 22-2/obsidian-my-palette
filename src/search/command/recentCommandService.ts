import type { App } from "obsidian";
import {
	RecentCommandStore,
	type RecentCommandStoreLogger,
} from "src/search/command/recentCommandStore";

/**
 * Recent command ids backed by IndexedDB. When IndexedDB cannot accept the
 * data, the ids stay in memory and are mirrored to `data.json` through
 * `onLegacyChange`, so a later settings save can never erase them.
 */
export class RecentCommandService {
	private readonly store: RecentCommandStore;
	private legacyIds?: string[];

	constructor(
		app: App,
		log: RecentCommandStoreLogger,
		private readonly onLegacyChange: () => void,
	) {
		this.store = new RecentCommandStore(app, log);
	}

	async load(legacyIds: readonly string[]): Promise<void> {
		const persistent = await this.store.load(legacyIds);
		this.legacyIds = persistent ? undefined : [...this.store.getIds()];
	}

	/** Ids to write to `data.json`; undefined once IndexedDB owns the list. */
	getLegacyIds(): readonly string[] | undefined {
		return this.legacyIds;
	}

	getIds(): string[] {
		return [...this.store.getIds()];
	}

	record(id: string): void {
		this.store.record(id);
		if (!this.store.isPersistent) this.legacyIds = [...this.store.getIds()];
		if (this.legacyIds !== undefined) this.onLegacyChange();
	}

	dispose(): Promise<void> {
		return this.store.dispose();
	}
}
