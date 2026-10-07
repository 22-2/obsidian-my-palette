import type { App } from "obsidian";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { getVaultId, getVaultPathKey } from "src/shared/vaultIdentity";

const RECENT_ID_DATABASE_VERSION = 1;
const RECENT_ID_MIGRATION_VERSION = 1;

type StoredRecentId = {
	key: string;
	vaultId: string;
	position: number;
} & Record<string, unknown>;

interface RecentIdMigration {
	key: string;
	vaultId: string;
	version: number;
	migratedAt: number;
}

// The object store keeps its original "commands" name: renaming it would need a
// schema upgrade, and existing recent-command databases must stay readable.
interface RecentIdDatabase extends DBSchema {
	commands: {
		key: string;
		value: StoredRecentId;
		indexes: { byVault: string };
	};
	migrations: {
		key: string;
		value: RecentIdMigration;
	};
}

export type RecentIdStoreLogger = (message: string, detail?: unknown) => void;

export interface RecentIdStoreOptions {
	databaseName: string;
	/** Record field holding the id; configurable so existing databases stay readable. */
	idField: string;
	/** Prefix of the per-vault marker recording the one-time legacy import. */
	migrationName: string;
	maxEntries: number;
	/** Plural noun used in log messages, such as "recent commands". */
	label: string;
	/** Ids with the same key are duplicates; the newest spelling is kept. */
	dedupeKey?: (id: string) => string;
}

/** Keep a stored or legacy id list bounded and free of duplicates. */
export function normalizeRecentIds(
	value: unknown,
	maxEntries: number,
	dedupeKey: (id: string) => string = (id) => id,
): string[] {
	if (!Array.isArray(value)) return [];
	const ids = new Map<string, string>();
	for (const id of value) {
		if (typeof id !== "string" || id.length === 0) continue;
		const key = dedupeKey(id);
		if (!ids.has(key)) ids.set(key, id);
	}
	return [...ids.values()].slice(0, maxEntries);
}

/**
 * Keeps recent-id lookups synchronous while IndexedDB writes run in order.
 * The position field is persisted because ids have no useful natural ordering
 * and several ids can be recorded within the same millisecond.
 */
export class RecentIdStore {
	private current: string[] = [];
	private readonly currentVaultId: string;
	private databasePromise?: Promise<IDBPDatabase<RecentIdDatabase>>;
	private loadPromise?: Promise<void>;
	private writePromise: Promise<void> = Promise.resolve();
	private loaded = false;
	private unavailable = false;
	private disposed = false;

	constructor(
		app: App,
		private readonly options: RecentIdStoreOptions,
		private readonly log: RecentIdStoreLogger = () => undefined,
	) {
		this.currentVaultId = getVaultId(app);
	}

	get isPersistent(): boolean {
		return this.loaded && !this.unavailable;
	}

	async load(legacyIds: readonly string[] = []): Promise<boolean> {
		if (this.loaded) return this.isPersistent;
		this.loadPromise ??= this.loadFromDatabase(legacyIds);
		await this.loadPromise;
		return this.isPersistent;
	}

	getIds(): readonly string[] {
		return [...this.current];
	}

	/** Moves the given ids to the front, keeping their order. */
	record(...ids: string[]): void {
		if (this.disposed || ids.length === 0) return;
		this.current = this.normalize([...ids, ...this.current]);
		this.queuePersist();
	}

	clear(): void {
		if (this.disposed) return;
		this.current = [];
		this.writePromise = this.writePromise
			.then(() => this.clearDatabase())
			.catch((error) => this.log(`Failed to clear ${this.options.label}`, { error }));
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

	private normalize(value: unknown): string[] {
		return normalizeRecentIds(value, this.options.maxEntries, this.options.dedupeKey);
	}

	private migrationKey(): string {
		return getVaultPathKey(
			this.currentVaultId,
			`${this.options.migrationName}:${RECENT_ID_MIGRATION_VERSION}`,
		);
	}

	private toStored(id: string, position: number): StoredRecentId {
		return {
			key: getVaultPathKey(this.currentVaultId, id),
			vaultId: this.currentVaultId,
			[this.options.idField]: id,
			position,
		};
	}

	private fromStored(value: unknown): { position: number; id: string } | undefined {
		if (!value || typeof value !== "object") return undefined;
		const source = value as Record<string, unknown>;
		const id = source[this.options.idField];
		if (
			source.vaultId !== this.currentVaultId ||
			typeof source.key !== "string" ||
			typeof id !== "string" ||
			id.length === 0 ||
			typeof source.position !== "number" ||
			!Number.isInteger(source.position) ||
			source.position < 0 ||
			source.key !== getVaultPathKey(this.currentVaultId, id)
		)
			return undefined;
		return { position: source.position, id };
	}

	private queuePersist(): void {
		// Rewriting the bounded list keeps ordering exact and avoids races between
		// quick successive records that would otherwise update rank independently.
		this.writePromise = this.writePromise
			.then(() => this.persistCurrent())
			.catch((error) => this.log(`Failed to persist ${this.options.label}`, { error }));
	}

	private getDatabase(): Promise<IDBPDatabase<RecentIdDatabase>> {
		this.databasePromise ??= openDB<RecentIdDatabase>(
			this.options.databaseName,
			RECENT_ID_DATABASE_VERSION,
			{
				upgrade(database) {
					if (!database.objectStoreNames.contains("commands")) {
						const store = database.createObjectStore("commands", { keyPath: "key" });
						store.createIndex("byVault", "vaultId");
					}
					if (!database.objectStoreNames.contains("migrations"))
						database.createObjectStore("migrations", { keyPath: "key" });
				},
			},
		);
		return this.databasePromise;
	}

	private async loadFromDatabase(legacyIds: readonly string[]): Promise<void> {
		try {
			const database = await this.getDatabase();
			const marker = await database.get("migrations", this.migrationKey());
			if (!marker) {
				const now = Date.now();
				const transaction = database.transaction(["commands", "migrations"], "readwrite");
				const store = transaction.objectStore("commands");
				for (const [position, id] of this.normalize(legacyIds).entries())
					await store.put(this.toStored(id, position));
				await transaction.objectStore("migrations").put({
					key: this.migrationKey(),
					vaultId: this.currentVaultId,
					version: RECENT_ID_MIGRATION_VERSION,
					migratedAt: now,
				});
				await transaction.done;
			}

			const records = await database.getAllFromIndex(
				"commands",
				"byVault",
				this.currentVaultId,
			);
			const valid = records.flatMap((value) => {
				const normalized = this.fromStored(value);
				return normalized ? [normalized] : [];
			});
			const retained = valid
				.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
				.map(({ id }) => id);
			this.current = this.normalize(retained);
			const retainedKeys = new Set(
				this.current.map((id) => getVaultPathKey(this.currentVaultId, id)),
			);
			const discarded = records.filter(
				(value) => typeof value.key === "string" && !retainedKeys.has(value.key),
			);
			if (discarded.length > 0) {
				const transaction = database.transaction("commands", "readwrite");
				for (const record of discarded) await transaction.store.delete(record.key);
				await transaction.done;
			}
		} catch (error) {
			this.unavailable = true;
			this.current = this.normalize(legacyIds);
			this.log(`IndexedDB for ${this.options.label} is unavailable`, { error });
		} finally {
			this.loaded = true;
			this.log(`Loaded ${this.options.label}`, { entries: this.current.length });
		}
	}

	private async persistCurrent(): Promise<void> {
		if (!this.loaded || this.unavailable) return;
		try {
			const database = await this.getDatabase();
			const existing = await database.getAllFromIndex(
				"commands",
				"byVault",
				this.currentVaultId,
			);
			const transaction = database.transaction("commands", "readwrite");
			for (const record of existing) await transaction.store.delete(record.key);
			for (const [position, id] of this.current.entries())
				await transaction.store.put(this.toStored(id, position));
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log(`Failed to persist ${this.options.label}`, { error });
		}
	}

	private async clearDatabase(): Promise<void> {
		if (!this.loaded || this.unavailable) return;
		try {
			const database = await this.getDatabase();
			const records = await database.getAllFromIndex(
				"commands",
				"byVault",
				this.currentVaultId,
			);
			const transaction = database.transaction("commands", "readwrite");
			for (const record of records) await transaction.store.delete(record.key);
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log(`Failed to clear ${this.options.label}`, { error });
		}
	}
}
