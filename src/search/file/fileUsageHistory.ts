import type { App } from "obsidian";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { getVaultId, getVaultPathKey } from "src/shared/vaultIdentity";

const DATABASE_NAME = "my-palette-file-usage";
const DATABASE_VERSION = 1;
const MAX_TRACKED_FILES = 5_000;
const MAX_USAGE_COUNT = 1_000;

/** A two-week half-life keeps an old burst of activity from becoming permanent. */
export const FILE_USAGE_RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1_000;
/** Frequency is useful, but it must saturate so one habitual note cannot dominate. */
export const FILE_USAGE_MAX_FREQUENCY = 20;

export interface FileUsageRecord {
	count: number;
	lastUsedAt: number;
}

export interface FileUsageScoreSource {
	getScores(now?: number): ReadonlyMap<string, number>;
}

interface StoredFileUsageRecord extends FileUsageRecord {
	key: string;
	vaultId: string;
	path: string;
}

interface FileUsageDatabase extends DBSchema {
	usage: {
		key: string;
		value: StoredFileUsageRecord;
		indexes: { byVault: string };
	};
}

export type FileUsageHistoryLogger = (message: string, detail?: unknown) => void;

function finiteTimestamp(value: number): number | undefined {
	return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function toRecord(value: unknown): FileUsageRecord | undefined {
	if (!value || typeof value !== "object") return undefined;
	const source = value as Record<string, unknown>;
	if (
		typeof source.count !== "number" ||
		!Number.isFinite(source.count) ||
		typeof source.lastUsedAt !== "number"
	)
		return undefined;
	const lastUsedAt = finiteTimestamp(source.lastUsedAt);
	if (lastUsedAt === undefined || source.count < 1) return undefined;
	return {
		count: Math.min(MAX_USAGE_COUNT, Math.max(1, Math.floor(source.count))),
		lastUsedAt,
	};
}

/**
 * Converts a persisted usage record into a bounded score for the sorter. The
 * recency decay and logarithmic frequency cap keep history as a small hint that
 * only matters after the configured match and metadata priorities tie.
 */
export function calculateFileUsageScore(record: FileUsageRecord, now: number): number {
	const normalized = toRecord(record);
	const timestamp = finiteTimestamp(now);
	if (!normalized || timestamp === undefined) return 0;
	const age = Math.max(0, timestamp - normalized.lastUsedAt);
	const recency = 0.5 ** (age / FILE_USAGE_RECENCY_HALF_LIFE_MS);
	const frequency =
		Math.log1p(Math.min(normalized.count, FILE_USAGE_MAX_FREQUENCY)) /
		Math.log1p(FILE_USAGE_MAX_FREQUENCY);
	return recency * (0.5 + frequency * 0.5);
}

/**
 * Stores only Vault-relative paths and aggregate usage. The browser database is
 * a rebuildable cache, so an unavailable or corrupt store must never block search.
 */
export class FileUsageHistory implements FileUsageScoreSource {
	private readonly current = new Map<string, FileUsageRecord>();
	private readonly currentVaultId: string;
	private databasePromise?: Promise<IDBPDatabase<FileUsageDatabase>>;
	private loadPromise?: Promise<void>;
	private writePromise: Promise<void> = Promise.resolve();
	private loaded = false;
	private unavailable = false;
	private disposed = false;

	constructor(
		app: App,
		private readonly log: FileUsageHistoryLogger = () => undefined,
	) {
		this.currentVaultId = getVaultId(app);
	}

	async load(): Promise<void> {
		if (this.loaded) return;
		this.loadPromise ??= this.loadFromDatabase();
		await this.loadPromise;
	}

	getScores(now = Date.now()): ReadonlyMap<string, number> {
		const scores = new Map<string, number>();
		for (const [path, record] of this.current) {
			const score = calculateFileUsageScore(record, now);
			if (score > 0) scores.set(path, score);
		}
		return scores;
	}

	record(path: string, now = Date.now()): void {
		if (this.disposed || !path) return;
		const timestamp = finiteTimestamp(now) ?? Date.now();
		const previous = this.current.get(path);
		this.current.set(path, {
			count: Math.min(MAX_USAGE_COUNT, (previous?.count ?? 0) + 1),
			lastUsedAt: Math.max(previous?.lastUsedAt ?? 0, timestamp),
		});
		const removedPaths = this.prune();
		// Queue writes because several quick palette actions can otherwise race in
		// separate readwrite transactions and make the latest count disappear.
		this.writePromise = this.writePromise
			.then(async () => {
				await this.load();
				await this.persist(path, removedPaths);
			})
			.catch((error) => this.log("Failed to persist file usage history", { error }));
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		await this.loadPromise?.catch(() => undefined);
		await this.writePromise;
		if (!this.databasePromise) return;
		try {
			(await this.databasePromise).close();
		} catch {
			// Database initialization failures are already treated as an optional cache.
		}
	}

	private getDatabase(): Promise<IDBPDatabase<FileUsageDatabase>> {
		this.databasePromise ??= openDB<FileUsageDatabase>(DATABASE_NAME, DATABASE_VERSION, {
			upgrade(database) {
				if (!database.objectStoreNames.contains("usage")) {
					const store = database.createObjectStore("usage", { keyPath: "key" });
					store.createIndex("byVault", "vaultId");
				}
			},
		});
		return this.databasePromise;
	}

	private async loadFromDatabase(): Promise<void> {
		try {
			const database = await this.getDatabase();
			const entries = await database.getAllFromIndex("usage", "byVault", this.currentVaultId);
			const valid = entries.flatMap((entry) => {
				if (
					typeof entry.key !== "string" ||
					typeof entry.path !== "string" ||
					entry.path.length === 0 ||
					entry.vaultId !== this.currentVaultId ||
					entry.key !== getVaultPathKey(this.currentVaultId, entry.path)
				)
					return [];
				const record = toRecord(entry);
				return record ? [{ entry, record }] : [];
			});
			const retained = valid
				.sort(
					(a, b) =>
						b.record.lastUsedAt - a.record.lastUsedAt ||
						b.record.count - a.record.count ||
						a.entry.path.localeCompare(b.entry.path),
				)
				.slice(0, MAX_TRACKED_FILES);
			for (const { entry, record } of retained) this.current.set(entry.path, record);
			const retainedKeys = new Set(retained.map(({ entry }) => entry.key));
			const discarded = entries.filter(
				(entry) => typeof entry.key === "string" && !retainedKeys.has(entry.key),
			);
			if (discarded.length > 0) {
				const transaction = database.transaction("usage", "readwrite");
				for (const entry of discarded) await transaction.store.delete(entry.key);
				await transaction.done;
			}
		} catch (error) {
			this.unavailable = true;
			this.log("File usage history is unavailable", { error });
		} finally {
			this.loaded = true;
			this.log("Loaded file usage history", { entries: this.current.size });
		}
	}

	private prune(): string[] {
		if (this.current.size <= MAX_TRACKED_FILES) return [];
		const removedPaths = [...this.current.entries()]
			.sort(
				([pathA, a], [pathB, b]) =>
					a.lastUsedAt - b.lastUsedAt || a.count - b.count || pathA.localeCompare(pathB),
			)
			.slice(0, this.current.size - MAX_TRACKED_FILES)
			.map(([path]) => path);
		for (const path of removedPaths) this.current.delete(path);
		return removedPaths;
	}

	private async persist(path: string, removedPaths: readonly string[]): Promise<void> {
		if (this.unavailable) return;
		try {
			const database = await this.getDatabase();
			const transaction = database.transaction("usage", "readwrite");
			const current = this.current.get(path);
			if (current) {
				await transaction.store.put({
					...current,
					key: getVaultPathKey(this.currentVaultId, path),
					vaultId: this.currentVaultId,
					path,
				});
			} else {
				await transaction.store.delete(getVaultPathKey(this.currentVaultId, path));
			}
			for (const removedPath of removedPaths)
				await transaction.store.delete(getVaultPathKey(this.currentVaultId, removedPath));
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log("Failed to persist file usage history", { path, error });
		}
	}
}
