import type { App } from "obsidian";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import { MAX_RECENT_COMMAND_IDS } from "src/model/settings";
import { getVaultId, getVaultPathKey } from "src/shared/vaultIdentity";

export const RECENT_COMMAND_DATABASE_NAME = "my-palette-recent-commands";
const RECENT_COMMAND_DATABASE_VERSION = 1;
const RECENT_COMMAND_MIGRATION_VERSION = 1;

interface StoredRecentCommand {
	key: string;
	vaultId: string;
	commandId: string;
	position: number;
}

interface RecentCommandMigration {
	key: string;
	vaultId: string;
	version: number;
	migratedAt: number;
}

interface RecentCommandDatabase extends DBSchema {
	commands: {
		key: string;
		value: StoredRecentCommand;
		indexes: { byVault: string };
	};
	migrations: {
		key: string;
		value: RecentCommandMigration;
	};
}

export type RecentCommandStoreLogger = (message: string, detail?: unknown) => void;

function migrationKey(vaultId: string): string {
	return getVaultPathKey(vaultId, `recent-commands:${RECENT_COMMAND_MIGRATION_VERSION}`);
}

/** Keep the legacy settings value bounded before it enters memory or IDB. */
export function normalizeRecentCommandIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return [
		...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0)),
	].slice(0, MAX_RECENT_COMMAND_IDS);
}

function storedCommand(
	value: unknown,
	vaultId: string,
): { stored: StoredRecentCommand; commandId: string } | undefined {
	if (!value || typeof value !== "object") return undefined;
	const source = value as Record<string, unknown>;
	if (
		source.vaultId !== vaultId ||
		typeof source.key !== "string" ||
		typeof source.commandId !== "string" ||
		source.commandId.length === 0 ||
		typeof source.position !== "number" ||
		!Number.isFinite(source.position) ||
		!Number.isInteger(source.position) ||
		source.position < 0 ||
		source.key !== getVaultPathKey(vaultId, source.commandId)
	)
		return undefined;
	return { stored: source as unknown as StoredRecentCommand, commandId: source.commandId };
}

function toStoredCommand(
	vaultId: string,
	commandId: string,
	position: number,
): StoredRecentCommand {
	return {
		key: getVaultPathKey(vaultId, commandId),
		vaultId,
		commandId,
		position,
	};
}

/**
 * Keeps command suggestions synchronous while IndexedDB writes run in order.
 * The position field is persisted because command IDs have no useful natural
 * ordering and several commands can be executed within the same millisecond.
 */
export class RecentCommandStore {
	private current: string[] = [];
	private readonly currentVaultId: string;
	private databasePromise?: Promise<IDBPDatabase<RecentCommandDatabase>>;
	private loadPromise?: Promise<void>;
	private writePromise: Promise<void> = Promise.resolve();
	private loaded = false;
	private unavailable = false;
	private disposed = false;

	constructor(
		app: App,
		private readonly log: RecentCommandStoreLogger = () => undefined,
	) {
		this.currentVaultId = getVaultId(app);
	}

	get isPersistent(): boolean {
		return this.loaded && !this.unavailable;
	}

	async load(legacyCommandIds: readonly string[] = []): Promise<boolean> {
		if (this.loaded) return this.isPersistent;
		this.loadPromise ??= this.loadFromDatabase(legacyCommandIds);
		await this.loadPromise;
		return this.isPersistent;
	}

	getIds(): readonly string[] {
		return [...this.current];
	}

	record(commandId: string): void {
		if (this.disposed || !commandId) return;
		this.current = normalizeRecentCommandIds([commandId, ...this.current]);
		this.queuePersist();
	}

	clear(): void {
		if (this.disposed) return;
		this.current = [];
		this.writePromise = this.writePromise
			.then(() => this.clearDatabase())
			.catch((error) => this.log("Failed to clear recent commands", { error }));
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

	private queuePersist(): void {
		// Rewriting at most twenty rows keeps ordering exact and avoids races between
		// quick command executions that would otherwise update rank independently.
		this.writePromise = this.writePromise
			.then(() => this.persistCurrent())
			.catch((error) => this.log("Failed to persist recent commands", { error }));
	}

	private getDatabase(): Promise<IDBPDatabase<RecentCommandDatabase>> {
		this.databasePromise ??= openDB<RecentCommandDatabase>(
			RECENT_COMMAND_DATABASE_NAME,
			RECENT_COMMAND_DATABASE_VERSION,
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

	private async loadFromDatabase(legacyCommandIds: readonly string[]): Promise<void> {
		try {
			const database = await this.getDatabase();
			const marker = await database.get("migrations", migrationKey(this.currentVaultId));
			if (!marker) {
				const now = Date.now();
				const transaction = database.transaction(["commands", "migrations"], "readwrite");
				const commandStore = transaction.objectStore("commands");
				for (const [position, commandId] of normalizeRecentCommandIds(
					legacyCommandIds,
				).entries())
					await commandStore.put(
						toStoredCommand(this.currentVaultId, commandId, position),
					);
				await transaction.objectStore("migrations").put({
					key: migrationKey(this.currentVaultId),
					vaultId: this.currentVaultId,
					version: RECENT_COMMAND_MIGRATION_VERSION,
					migratedAt: now,
				});
				await transaction.done;
			}

			const commands = await database.getAllFromIndex(
				"commands",
				"byVault",
				this.currentVaultId,
			);
			const valid = commands.flatMap((value) => {
				const normalized = storedCommand(value, this.currentVaultId);
				return normalized ? [normalized] : [];
			});
			const retained = valid
				.sort(
					(a, b) =>
						a.stored.position - b.stored.position ||
						a.commandId.localeCompare(b.commandId),
				)
				.map(({ commandId }) => commandId);
			this.current = normalizeRecentCommandIds(retained);
			const retainedKeys = new Set(
				this.current.map((commandId) => getVaultPathKey(this.currentVaultId, commandId)),
			);
			const discarded = commands.filter(
				(value) => typeof value.key === "string" && !retainedKeys.has(value.key),
			);
			if (discarded.length > 0) {
				const transaction = database.transaction("commands", "readwrite");
				for (const command of discarded) await transaction.store.delete(command.key);
				await transaction.done;
			}
		} catch (error) {
			this.unavailable = true;
			this.current = normalizeRecentCommandIds(legacyCommandIds);
			this.log("Recent command IndexedDB is unavailable", { error });
		} finally {
			this.loaded = true;
			this.log("Loaded recent commands", { entries: this.current.length });
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
			for (const command of existing) await transaction.store.delete(command.key);
			for (const [position, commandId] of this.current.entries())
				await transaction.store.put(
					toStoredCommand(this.currentVaultId, commandId, position),
				);
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log("Failed to persist recent commands", { error });
		}
	}

	private async clearDatabase(): Promise<void> {
		if (!this.loaded || this.unavailable) return;
		try {
			const database = await this.getDatabase();
			const commands = await database.getAllFromIndex(
				"commands",
				"byVault",
				this.currentVaultId,
			);
			const transaction = database.transaction("commands", "readwrite");
			for (const command of commands) await transaction.store.delete(command.key);
			await transaction.done;
		} catch (error) {
			this.unavailable = true;
			this.log("Failed to clear recent commands", { error });
		}
	}
}
