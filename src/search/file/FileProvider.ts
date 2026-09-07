import { parseFrontMatterTags, type App, type EventRef, type TFile } from "obsidian";
import { getUserIgnoreFilters, isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPaths";
import { IgnoredNoteIndex, type IgnoredNoteIndexLogger } from "src/ignored-notes/ignoredNoteIndex";
import type { FileResult } from "src/model/results";
import {
	DEFAULT_FILE_SORT_PRIORITIES,
	FILE_SORT_PRIORITIES,
	type FileSortPriorities,
} from "src/model/settings";
import { normalizeFrontmatterPrior } from "src/shared/frontmatter";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	isExcludedFolder,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import { createFileMatch, fileSearchKeys, type FileSearchEntry } from "src/search/file/fileMatch";
import { sortFileMatches, sortFilesWithoutQuery } from "src/search/file/fileSorting";
import { isTagOnlyQuery, normalizeTags } from "src/search/file/fileTags";
import type { FileUsageScoreSource } from "src/search/file/fileUsageHistory";
import { searchFuzzyQueryWithFieldScores } from "src/search/fuzzyQuery";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";

function aliases(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter((alias) => alias.trim().length > 0);
	return value == null ? [] : [String(value)].filter((alias) => alias.trim().length > 0);
}

export class FileProvider implements PaletteProvider<FileResult> {
	private readonly cache = new Map<string, FileSearchEntry>();
	private readonly allEntries = new Map<string, FileSearchEntry>();
	private readonly refs: EventRef[] = [];
	private readonly ignoredIndex: IgnoredNoteIndex;
	private allowedExtensions = new Set<string>();

	constructor(
		private readonly app: App,
		private readonly vaultExtensions: () => readonly string[],
		ignoredLogger?: IgnoredNoteIndexLogger,
		private readonly fileSortPriorities: () => FileSortPriorities = () => ({
			blank: [...DEFAULT_FILE_SORT_PRIORITIES],
			input: [...DEFAULT_FILE_SORT_PRIORITIES],
		}),
		private readonly usageHistory?: FileUsageScoreSource,
		private readonly excludedFolders: ExcludedFolderSource = EMPTY_EXCLUDED_FOLDER_SOURCE,
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
		const fileTags = normalizeTags([
			...(metadata?.tags ?? []).map(({ tag }) => tag),
			...(parseFrontMatterTags(metadata?.frontmatter) ?? []),
		]);
		const prior = normalizeFrontmatterPrior(metadata?.frontmatter?.prior);
		// Search metadata stays consistent between visible and ignored notes; H1 is
		// intentionally excluded because it is not stable note identity metadata. The
		// numeric `prior` value is kept separately because it controls ordering only.
		this.setEntry({
			file,
			path: file.path,
			basename: file.basename,
			aliases: fileAliases,
			tags: fileTags,
			prior,
			extension: file.extension,
			text: [file.basename, file.path, ...fileAliases].join(" "),
			mtime: file.stat.mtime,
			ignored: false,
		});
	}

	async search({ query, includeIgnored = false }: PaletteSearchRequest): Promise<FileResult[]> {
		const recentPaths = this.app.workspace.getLastOpenFiles?.() ?? [];
		const recent = new Map(recentPaths.map((filePath, index) => [filePath, index]));
		const usageScores = this.usageHistory?.getScores();
		const ignoreFilters = getUserIgnoreFilters(this.app);
		// プラグイン共通の除外フォルダはObsidianの除外設定と合わせて判定する。
		// includeIgnored指定時のみ両方をまとめて解除し、通常検索では常に除外する。
		const entries = [...this.cache.values()].filter(
			(entry) =>
				!isUserIgnoredPathWithFilters(ignoreFilters, entry.path) &&
				!isExcludedFolder(this.excludedFolders, entry.path),
		);
		if (includeIgnored) {
			// The explicit prefix also authorizes an empty-query listing. The
			// result limit in the palette keeps the UI bounded while the sorter
			// places ignored notes before the normal Vault entries.
			for (const ignored of await this.ignoredIndex.getEntries()) {
				if (isExcludedFolder(this.excludedFolders, ignored.path)) continue;
				const entry: FileSearchEntry = {
					path: ignored.path,
					basename: ignored.basename,
					aliases: ignored.aliases,
					tags: ignored.tags,
					prior: ignored.prior,
					extension: ignored.extension,
					text: [ignored.basename, ignored.path, ...ignored.aliases].join(" "),
					mtime: ignored.mtime,
					ignored: true,
				};
				if (this.isAllowedExtension(entry.extension)) entries.push(entry);
			}
		}
		if (!query.trim()) {
			// Empty and typed searches serve different browsing intents, so each
			// reads its own priority sequence at search time for live settings edits.
			const files = sortFilesWithoutQuery(
				entries,
				recent,
				this.fileSortPriorities().blank,
				usageScores,
			);
			return files.map((entry) => this.result(entry));
		}
		// Boolean operators are resolved locally; Everything is deliberately left
		// untouched because it already owns and interprets the same syntax.
		const tagOnlyQuery = isTagOnlyQuery(query);
		const inputSortPriorities = this.fileSortPriorities().input;
		const usesMatchCoverage = inputSortPriorities.includes(FILE_SORT_PRIORITIES.matchCoverage);
		// A hash-prefixed query is an explicit tag lookup. Restricting its candidate
		// fields prevents a filename such as `project-plan.md` from masquerading as
		// a tagged note when the user is browsing `#project`.
		const candidates = tagOnlyQuery
			? entries.filter((entry) => entry.tags.length > 0)
			: entries;
		const matches = searchFuzzyQueryWithFieldScores(
			query,
			candidates,
			fileSearchKeys(tagOnlyQuery),
		).map((match) => createFileMatch(match, query, { tagOnlyQuery, usesMatchCoverage }));
		const matchedTagsByPath = new Map(
			matches.map(({ obj, matchedTags }) => [obj.path, matchedTags]),
		);
		return sortFileMatches(
			matches,
			tagOnlyQuery ? undefined : query,
			recent,
			inputSortPriorities,
			usageScores,
		).map((entry) => this.result(entry, matchedTagsByPath.get(entry.path)));
	}

	private result(entry: FileSearchEntry, matchedTags?: readonly string[]): FileResult {
		return {
			id: entry.path,
			mode: "file",
			primary: [entry.basename, ...entry.aliases].join(" / "),
			secondary: entry.path,
			icon: entry.extension === "md" ? "file-text" : "file",
			vaultPath: entry.path,
			file: entry.file,
			ignored: entry.ignored,
			matchedTags: matchedTags?.length ? [...matchedTags] : undefined,
		};
	}

	private setEntry(entry: FileSearchEntry): void {
		this.allEntries.set(entry.path, entry);
		this.syncCachedEntry(entry);
	}

	private syncCachedEntry(entry: FileSearchEntry): void {
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
