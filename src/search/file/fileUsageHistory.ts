import type { App } from "obsidian";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { getVaultId, getVaultPathKey } from "src/shared/vaultIdentity";
import { DATABASE_NAMES } from "src/shared/databaseNames";

const DATABASE_VERSION = 1;
const MAX_TRACKED_FILES = 5_000;
const MAX_USAGE_COUNT = 1_000;

/** 半減期を2週間にすると、古い一時的な利用が恒久的な順位にならない。 */
export const FILE_USAGE_RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1_000;
/** 利用の回数は役に立つが、1つの習慣的なノートが支配しないよう、頭打ちにする必要がある。 */
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
 * 保存された利用の記録を、並べ替えのための上限付きの得点に変換する。新しさの減衰と、対数の回数の上限が、
 * 履歴を小さな手がかりに保つ。設定された一致とメタデータの優先度が同点になったときにだけ効く。
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
 * Vault 相対のパスと、まとめた利用だけを保存する。ブラウザーのデータベースは作り直せるキャッシュなので、
 * 利用できない、または壊れた保存先が検索を決して止めてはいけない。
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
		// 素早いパレットの操作が、別々の readwrite トランザクションで競合し、最新の回数が消えてしまわないように、
		// 書き込みはキューに入れる。
		this.writePromise = this.writePromise
			.then(async () => {
				await this.load();
				await this.persist(path, removedPaths);
			})
			.catch((error: unknown) => this.log("Failed to persist file usage history", { error }));
	}

	async dispose(): Promise<void> {
		this.disposed = true;
		await this.loadPromise?.catch(() => undefined);
		await this.writePromise;
		if (!this.databasePromise) return;
		try {
			(await this.databasePromise).close();
		} catch {
			// データベースの初期化の失敗は、すでに任意のキャッシュとして扱っている。
		}
	}

	private getDatabase(): Promise<IDBPDatabase<FileUsageDatabase>> {
		this.databasePromise ??= openDB<FileUsageDatabase>(
			DATABASE_NAMES.fileUsage,
			DATABASE_VERSION,
			{
				upgrade(database) {
					if (!database.objectStoreNames.contains("usage")) {
						const store = database.createObjectStore("usage", { keyPath: "key" });
						store.createIndex("byVault", "vaultId");
					}
				},
			},
		);
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
