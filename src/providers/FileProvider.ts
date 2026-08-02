import { type App, type EventRef, type TFile } from "obsidian";
import fuzzysort from "fuzzysort";
import { getUserIgnoreFilters, isUserIgnoredPath } from "src/core/ignoredPaths";
import type { FileResult } from "src/model/results";
import { sortFileMatches, sortFilesWithoutQuery } from "src/providers/fileSorting";
import type { PaletteProvider, PaletteSearchRequest } from "src/providers/PaletteProvider";

interface SearchEntry {
	file?: TFile;
	path: string;
	basename: string;
	aliases: string[];
	extension: string;
	text: string;
	mtime: number;
}

function aliases(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter((alias) => alias.trim().length > 0);
	return value == null ? [] : [String(value)].filter((alias) => alias.trim().length > 0);
}

export class FileProvider implements PaletteProvider<FileResult> {
	private readonly cache = new Map<string, SearchEntry>();
	private readonly allEntries = new Map<string, SearchEntry>();
	private readonly refs: EventRef[] = [];
	private readonly ignoredReady: Promise<void>;
	private allowedExtensions = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly vaultExtensions: () => readonly string[],
	) {
		this.updateAllowedExtensions();
		this.rebuild();
		this.ignoredReady = this.rebuildIgnored();
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
	}

	refreshExtensions(): void {
		this.updateAllowedExtensions();
		this.cache.clear();
		for (const entry of this.allEntries.values()) this.syncCachedEntry(entry);
	}

	private rebuild(): void {
		this.cache.clear();
		this.allEntries.clear();
		this.app.vault.getFiles().forEach((file) => this.update(file));
	}

	private update(file: TFile): void {
		// Keep all entries so extension-setting changes only need an in-memory cache refresh.
		const metadata = this.app.metadataCache.getFileCache(file);
		const h1 = metadata?.headings?.find((heading) => heading.level === 1)?.heading ?? "";
		const fileAliases = aliases(metadata?.frontmatter?.aliases ?? metadata?.frontmatter?.alias);
		this.setEntry({
			file,
			path: file.path,
			basename: file.basename,
			aliases: fileAliases,
			extension: file.extension,
			text: [file.basename, file.path, ...fileAliases, h1].join(" "),
			mtime: file.stat.mtime,
		});
	}

	private async rebuildIgnored(): Promise<void> {
		const visited = new Set<string>();
		for (const root of getUserIgnoreFilters(this.app)) {
			await this.scanIgnoredDirectory(root, visited);
		}
	}

	private async scanIgnoredDirectory(directory: string, visited: Set<string>): Promise<void> {
		if (visited.has(directory)) return;
		visited.add(directory);
		try {
			const listing = await this.app.vault.adapter.list(directory);
			for (const filePath of listing.files) this.addIgnoredFile(filePath);
			for (const folderPath of listing.folders)
				await this.scanIgnoredDirectory(folderPath, visited);
		} catch {
			// Missing ignore roots are valid Obsidian configuration and are skipped.
		}
	}

	private addIgnoredFile(filePath: string): void {
		const filename = filePath.slice(filePath.lastIndexOf("/") + 1);
		const extension = filename.includes(".")
			? filename.slice(filename.lastIndexOf(".") + 1)
			: "";
		const basename = extension ? filename.slice(0, -(extension.length + 1)) : filename;
		this.setEntry({
			path: filePath,
			basename,
			extension,
			aliases: [],
			text: `${basename} ${filePath}`,
			mtime: 0,
		});
	}

	async search({ query }: PaletteSearchRequest): Promise<FileResult[]> {
		await this.ignoredReady;
		const recentPaths = this.app.workspace.getLastOpenFiles?.() ?? [];
		const recent = new Map(recentPaths.map((filePath, index) => [filePath, index]));
		const entries = [...this.cache.values()];
		if (!query.trim()) {
			const files = sortFilesWithoutQuery(
				entries.filter((entry) => !isUserIgnoredPath(this.app, entry.path)),
				recent,
			);
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
