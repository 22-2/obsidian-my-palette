import { type App, type EventRef, type TFile } from "obsidian";
import fuzzysort from "fuzzysort";
import { getUserIgnoreFilters, isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPaths";
import { IgnoredNoteIndex, type IgnoredNoteIndexLogger } from "src/ignored-notes/ignoredNoteIndex";
import type { FileResult } from "src/model/results";
import { sortFileMatches, sortFilesWithoutQuery } from "src/search/file/fileSorting";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";

interface SearchEntry {
	file?: TFile;
	path: string;
	basename: string;
	aliases: string[];
	extension: string;
	text: string;
	mtime: number;
	ignored: boolean;
}

function aliases(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter((alias) => alias.trim().length > 0);
	return value == null ? [] : [String(value)].filter((alias) => alias.trim().length > 0);
}

export class FileProvider implements PaletteProvider<FileResult> {
	private readonly cache = new Map<string, SearchEntry>();
	private readonly allEntries = new Map<string, SearchEntry>();
	private readonly refs: EventRef[] = [];
	private readonly ignoredIndex: IgnoredNoteIndex;
	private allowedExtensions = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly vaultExtensions: () => readonly string[],
		ignoredLogger?: IgnoredNoteIndexLogger,
	) {
		this.updateAllowedExtensions();
		this.rebuild();
		this.ignoredIndex = new IgnoredNoteIndex(app, ignoredLogger);
		this.refs.push(
			app.vault.on("create", (file) => {
				if ("extension" in file) this.update(file as TFile);
			}),
		);
		this.refs.push(app.vault.on("delete", (file) => this.deleteEntry(file.path)));
		this.refs.push(
			app.vault.on("rename", (file, oldPath) => {
				this.deleteEntry(oldPath);
				if ("extension" in file) this.update(file as TFile);
			}),
		);
		this.refs.push(app.metadataCache.on("changed", (file) => this.update(file)));
		// FileProvider can be constructed before Obsidian has finished parsing all
		// frontmatter. Re-read files once that initial metadata pass completes so
		// aliases are not permanently cached as empty until their note is edited.
		this.refs.push(
			app.metadataCache.on("resolved", () => {
				this.app.vault.getFiles().forEach((file) => this.update(file));
			}),
		);
	}

	dispose(): void {
		this.refs.forEach((ref) => this.app.vault.offref(ref));
		void this.ignoredIndex.dispose();
	}

	refreshExtensions(): void {
		this.updateAllowedExtensions();
		this.cache.clear();
		for (const entry of this.allEntries.values()) this.syncCachedEntry(entry);
	}

	async rebuildIgnoredIndex(): Promise<void> {
		await this.ignoredIndex.rebuild();
	}

	private rebuild(): void {
		this.cache.clear();
		this.allEntries.clear();
		this.app.vault.getFiles().forEach((file) => this.update(file));
	}

	private update(file: TFile): void {
		// Keep all entries so extension-setting changes only need an in-memory cache refresh.
		const metadata = this.app.metadataCache.getFileCache(file);
		const fileAliases = aliases(metadata?.frontmatter?.aliases ?? metadata?.frontmatter?.alias);
		// Search metadata stays consistent between visible and ignored notes; H1 is
		// intentionally excluded because it is not stable note identity metadata.
		this.setEntry({
			file,
			path: file.path,
			basename: file.basename,
			aliases: fileAliases,
			extension: file.extension,
			text: [file.basename, file.path, ...fileAliases].join(" "),
			mtime: file.stat.mtime,
			ignored: false,
		});
	}

	async search({ query, includeIgnored = false }: PaletteSearchRequest): Promise<FileResult[]> {
		const recentPaths = this.app.workspace.getLastOpenFiles?.() ?? [];
		const recent = new Map(recentPaths.map((filePath, index) => [filePath, index]));
		const ignoreFilters = getUserIgnoreFilters(this.app);
		// Excluded files stay out of the normal index; the explicit prefix opts into
		// the separate adapter-backed index below and prevents duplicate candidates.
		const entries = [...this.cache.values()].filter(
			(entry) => !isUserIgnoredPathWithFilters(ignoreFilters, entry.path),
		);
		if (includeIgnored) {
			// The explicit prefix also authorizes an empty-query listing. The
			// result limit in the palette keeps the UI bounded while the sorter
			// places ignored notes before the normal Vault entries.
			for (const ignored of await this.ignoredIndex.getEntries()) {
				const entry: SearchEntry = {
					path: ignored.path,
					basename: ignored.basename,
					aliases: ignored.aliases,
					extension: ignored.extension,
					text: [ignored.basename, ignored.path, ...ignored.aliases].join(" "),
					mtime: ignored.mtime,
					ignored: true,
				};
				if (this.isAllowedExtension(entry.extension)) entries.push(entry);
			}
		}
		if (!query.trim()) {
			const files = sortFilesWithoutQuery(entries, recent);
			return files.map((entry) => this.result(entry));
		}
		const matches = [
			...fuzzysort.go(query, entries, {
				keys: [(entry) => entry.basename, (entry) => entry.path, (entry) => entry.text],
				scoreFn: (matches) => Math.max(...matches.map((match) => match?.score ?? 0)),
			}),
		];
		return sortFileMatches(matches, query, recent).map((entry) => this.result(entry));
	}

	private result(entry: SearchEntry): FileResult {
		return {
			id: entry.path,
			mode: "file",
			primary: [entry.basename, ...entry.aliases].join(" / "),
			secondary: entry.path,
			icon: entry.extension === "md" ? "file-text" : "file",
			vaultPath: entry.path,
			file: entry.file,
			ignored: entry.ignored,
		};
	}

	private setEntry(entry: SearchEntry): void {
		this.allEntries.set(entry.path, entry);
		this.syncCachedEntry(entry);
	}

	private syncCachedEntry(entry: SearchEntry): void {
		if (this.isAllowedExtension(entry.extension)) this.cache.set(entry.path, entry);
		else this.cache.delete(entry.path);
	}

	private deleteEntry(filePath: string): void {
		this.cache.delete(filePath);
		this.allEntries.delete(filePath);
	}

	private updateAllowedExtensions(): void {
		this.allowedExtensions = new Set(
			this.vaultExtensions().map((extension) => extension.toLocaleLowerCase()),
		);
	}

	private isAllowedExtension(extension: string): boolean {
		const allowed = this.allowedExtensions;
		return allowed.size === 0 || allowed.has(extension.toLocaleLowerCase());
	}
}
