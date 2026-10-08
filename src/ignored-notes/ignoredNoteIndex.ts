import type { App } from "obsidian";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import {
	getUserIgnoreFilters,
	isUserIgnoreFilterRegex,
	isUserIgnoredPathWithFilters,
} from "src/ignored-notes/ignoredPaths";
import { getVaultId, getVaultPathKey } from "src/shared/vaultIdentity";
import {
	parseIgnoredNoteFrontmatter,
	type IgnoredNoteIndexEntry,
} from "src/ignored-notes/ignoredNoteEntry";
import { ignoredNotePathParts } from "src/ignored-notes/ignoredNotePath";
import { collectVaultPaths, mapWithConcurrency } from "src/ignored-notes/ignoredNoteScanner";

export type { IgnoredNoteIndexEntry } from "src/ignored-notes/ignoredNoteEntry";

const DATABASE_NAME = "my-palette-ignored-notes";
const DATABASE_VERSION = 1;
const INDEX_SCHEMA_VERSION = 4;
const INDEX_TTL_MS = 24 * 60 * 60 * 1000;
const SCAN_CONCURRENCY = 8;
const PROGRESS_INTERVAL = 250;

interface StoredIgnoredNoteIndexEntry extends IgnoredNoteIndexEntry {
	vaultId: string;
	key: string;
}

interface IgnoredNoteIndexMeta {
	vaultId: string;
	schemaVersion: number;
	filterFingerprint: string;
	lastScannedAt: number;
}

interface IgnoredNoteIndexDatabase extends DBSchema {
	notes: {
		key: string;
		value: StoredIgnoredNoteIndexEntry;
		indexes: { byVault: string };
	};
	meta: {
		key: string;
		value: IgnoredNoteIndexMeta;
	};
}

export type IgnoredNoteIndexLogger = (message: string, detail?: unknown) => void;

function fingerprint(filters: readonly string[]): string {
	return filters
		.map((filter) => filter.toLocaleLowerCase())
		.sort()
		.join("\n");
}

/**
 * Indexes files hidden by Excluded files without making the normal palette pay
 * the scan cost. The index is a rebuildable cache, not a second source of truth.
 */
export class IgnoredNoteIndex {
	private readonly current = new Map<string, IgnoredNoteIndexEntry>();
	private readonly currentVaultId: string;
	private databasePromise?: Promise<IDBPDatabase<IgnoredNoteIndexDatabase>>;
	private loadPromise?: Promise<void>;
	private scanPromise?: Promise<void>;
	private loaded = false;
	private filterFingerprint = "";
	private lastScannedAt = 0;

	constructor(
		private readonly app: App,
		private readonly log: IgnoredNoteIndexLogger = () => undefined,
	) {
		this.currentVaultId = getVaultId(app);
	}

	async getEntries(): Promise<IgnoredNoteIndexEntry[]> {
		await this.ensureLoaded();
		const filters = getUserIgnoreFilters(this.app);
		const filtersChanged = fingerprint(filters) !== this.filterFingerprint;
		if ((filtersChanged || this.needsScan()) && !this.scanPromise) {
			// Excluded files can change while the plugin stays loaded. Waiting for an
			// explicit `i ` search to rescan prevents the prefix from appearing broken
			// for up to the index TTL after the user edits Obsidian's ignore filters.
			if (filtersChanged || this.current.size === 0) await this.rebuild();
			else void this.rebuild();
		}
		return [...this.current.values()];
	}

	async rebuild(): Promise<void> {
		if (this.scanPromise) return this.scanPromise;
		this.scanPromise = this.scan();
		try {
			await this.scanPromise;
		} finally {
			this.scanPromise = undefined;
		}
	}

	async dispose(): Promise<void> {
		if (!this.databasePromise) return;
		const database = await this.getDatabase();
		database.close();
	}

	private getDatabase(): Promise<IDBPDatabase<IgnoredNoteIndexDatabase>> {
		this.databasePromise ??= openDB<IgnoredNoteIndexDatabase>(DATABASE_NAME, DATABASE_VERSION, {
			upgrade(database) {
				if (!database.objectStoreNames.contains("notes")) {
					const store = database.createObjectStore("notes", { keyPath: "key" });
					store.createIndex("byVault", "vaultId");
				}
				if (!database.objectStoreNames.contains("meta")) database.createObjectStore("meta");
			},
		});
		return this.databasePromise;
	}

	private async ensureLoaded(): Promise<void> {
		if (this.loaded) return;
		this.loadPromise ??= this.load();
		await this.loadPromise;
	}

	private async load(): Promise<void> {
		const database = await this.getDatabase();
		const filters = getUserIgnoreFilters(this.app);
		this.filterFingerprint = fingerprint(filters);
		const [entries, meta] = await Promise.all([
			database.getAllFromIndex("notes", "byVault", this.currentVaultId),
			database.get("meta", this.currentVaultId),
		]);
		const canReuseEntries =
			meta?.schemaVersion === INDEX_SCHEMA_VERSION &&
			meta.filterFingerprint === this.filterFingerprint;
		if (canReuseEntries) {
			for (const entry of entries) this.current.set(entry.path, this.toPublicEntry(entry));
			this.lastScannedAt = meta.lastScannedAt;
		} else {
			// A changed entry shape, such as adding `prior` or tags, must be rebuilt before
			// returning ignored results; otherwise the first search would use stale data.
			this.log("Ignored-note index requires rebuild", { entries: entries.length });
		}
		this.loaded = true;
		this.log("Loaded ignored-note index", { entries: this.current.size });
	}

	private needsScan(): boolean {
		return Date.now() - this.lastScannedAt >= INDEX_TTL_MS;
	}

	private async scan(): Promise<void> {
		await this.ensureLoaded();
		const filters = getUserIgnoreFilters(this.app);
		const roots = filters.filter((filter) => !isUserIgnoreFilterRegex(filter));
		const regexCount = filters.length - roots.length;
		const scanRoots = regexCount > 0 ? [...roots, ""] : roots;
		if (regexCount > 0)
			this.log("Scanning Vault root to resolve ignored regex filters", { count: regexCount });
		this.log("Scanning ignored notes", { roots: scanRoots, cachedEntries: this.current.size });
		const paths = (await collectVaultPaths(this.app, scanRoots, this.log)).filter((path) =>
			isUserIgnoredPathWithFilters(filters, path),
		);
		const next = new Map<string, IgnoredNoteIndexEntry>();
		let processed = 0;
		const scanned = await mapWithConcurrency(paths, SCAN_CONCURRENCY, async (path) => {
			const entry = await this.readEntry(path, this.current.get(path));
			processed += 1;
			if (
				processed === 1 ||
				processed % PROGRESS_INTERVAL === 0 ||
				processed === paths.length
			)
				this.log("Scanning ignored notes", { processed, total: paths.length });
			return entry;
		});
		for (const entry of scanned) {
			if (entry) next.set(entry.path, entry);
		}
		this.filterFingerprint = fingerprint(filters);
		await this.save(next);
		this.current.clear();
		for (const [path, entry] of next) this.current.set(path, entry);
		this.lastScannedAt = Date.now();
		this.log("Finished scanning ignored notes", { entries: next.size });
	}

	private async readEntry(
		path: string,
		cached: IgnoredNoteIndexEntry | undefined,
	): Promise<IgnoredNoteIndexEntry | undefined> {
		try {
			const stat = await this.app.vault.adapter.stat(path);
			if (!stat) return undefined;
			if (cached && cached.mtime === stat.mtime && cached.size === stat.size) return cached;
			const parts = ignoredNotePathParts(path);
			const content =
				parts.extension === "md" ? await this.app.vault.adapter.read(path) : undefined;
			const frontmatter =
				content === undefined
					? { aliases: [], keywords: [], tags: [] }
					: parseIgnoredNoteFrontmatter(content);
			return {
				path,
				...parts,
				aliases: frontmatter.aliases,
				keywords: frontmatter.keywords,
				tags: frontmatter.tags,
				prior: frontmatter.prior,
				mtime: stat.mtime,
				size: stat.size,
			};
		} catch (error) {
			this.log("Failed to index ignored file", { path, error });
			// Keep a previously indexed entry through transient sync/lock errors; a
			// later TTL refresh can replace it once the source becomes readable again.
			return cached;
		}
	}

	private async save(entries: ReadonlyMap<string, IgnoredNoteIndexEntry>): Promise<void> {
		const database = await this.getDatabase();
		const transaction = database.transaction("notes", "readwrite");
		const existing = await transaction.store.index("byVault").getAll(this.currentVaultId);
		const nextKeys = new Set(entries.keys());
		for (const entry of existing) {
			if (!nextKeys.has(entry.path)) await transaction.store.delete(entry.key);
		}
		for (const entry of entries.values())
			await transaction.store.put({
				...entry,
				vaultId: this.currentVaultId,
				key: getVaultPathKey(this.currentVaultId, entry.path),
			});
		await transaction.done;
		await database.put(
			"meta",
			{
				vaultId: this.currentVaultId,
				schemaVersion: INDEX_SCHEMA_VERSION,
				filterFingerprint: this.filterFingerprint,
				lastScannedAt: Date.now(),
			},
			this.currentVaultId,
		);
	}

	private toPublicEntry(entry: StoredIgnoredNoteIndexEntry): IgnoredNoteIndexEntry {
		return {
			path: entry.path,
			basename: entry.basename,
			extension: entry.extension,
			aliases: entry.aliases,
			keywords: entry.keywords,
			tags: entry.tags,
			prior: entry.prior,
			mtime: entry.mtime,
			size: entry.size,
		};
	}
}
