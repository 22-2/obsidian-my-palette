import type { App } from "obsidian";
import {
	RecentCommandStore,
	type RecentCommandStoreLogger,
} from "src/search/command/recentCommandStore";

/**
 * IndexedDB に保存する最近のコマンド ID。IndexedDB がデータを受け付けられないときは、ID をメモリに置き、
 * `onLegacyChange` を通じて `data.json` にも写す。そうすれば、後の設定の保存で消えることはない。
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

	/** `data.json` に書く ID。IndexedDB が一覧を持つようになったら undefined。 */
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
