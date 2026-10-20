import {
	parseFrontMatterTags,
	type App,
	type EventRef,
	type TAbstractFile,
	type TFile,
} from "obsidian";
import { getUserIgnoreFilters, isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPaths";
import { IgnoredNoteIndex, type IgnoredNoteIndexLogger } from "src/ignored-notes/ignoredNoteIndex";
import type { FileResult } from "src/palette/results";
import {
	DEFAULT_FILE_SORT_PRIORITIES,
	FILE_SORT_PRIORITIES,
	type FileSortPriorities,
} from "src/settings/model";
import { normalizeFrontmatterKeywords, normalizeFrontmatterPrior } from "src/shared/frontmatter";
import {
	EMPTY_EXCLUDED_FOLDER_SOURCE,
	isExcludedFolder,
	type ExcludedFolderSource,
} from "src/search/excludedFolders";
import { isExtensionOpenable } from "src/platform/obsidianInternals";
import { createFileMatch, fileSearchKeys, type FileSearchEntry } from "src/search/file/fileMatch";
import { sortFileMatches, sortFilesWithoutQuery } from "src/search/file/fileSorting";
import { isTagOnlyQuery, normalizeTags } from "src/search/file/fileTags";
import type { FileUsageScoreSource } from "src/search/file/fileUsageHistory";
import {
	hasPositiveQueryTerms,
	searchFuzzyQuery,
	searchFuzzyQueryWithFieldScores,
} from "src/search/fuzzyQuery";
import type { PaletteProvider, PaletteSearchRequest } from "src/search/PaletteProvider";
import { fileIcon } from "src/ui/icons";

/** Vault のイベントはフォルダーも報告する。フォルダーには拡張子がないので、キャストせずにファイルを見分ける。 */
function isTFile(file: TAbstractFile): file is TFile {
	return "extension" in file;
}

function aliases(value: unknown): string[] {
	if (Array.isArray(value)) return value.map(String).filter((alias) => alias.trim().length > 0);
	const text = typeof value === "string" || typeof value === "number" ? String(value) : "";
	return text.trim().length > 0 ? [text] : [];
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
		private readonly demotedPriorFolders: () => readonly string[] = () => [],
		private readonly foldKana: () => boolean = () => false,
		private readonly openableFilesOnly: () => boolean = () => false,
	) {
		this.updateAllowedExtensions();
		this.rebuild();
		this.ignoredIndex = new IgnoredNoteIndex(app, ignoredLogger);
		this.refs.push(
			app.vault.on("create", (file) => {
				if (isTFile(file)) this.update(file);
			}),
		);
		this.refs.push(
			app.vault.on("modify", (file) => {
				if (isTFile(file)) this.update(file);
			}),
		);
		this.refs.push(app.vault.on("delete", (file) => this.deleteEntry(file.path)));
		this.refs.push(
			app.vault.on("rename", (file, oldPath) => {
				this.deleteEntry(oldPath);
				if (isTFile(file)) this.update(file);
			}),
		);
		this.refs.push(app.metadataCache.on("changed", (file) => this.update(file)));
		this.refs.push(
			app.metadataCache.on("deleted", (file) => {
				// Why: `deleted` はリネームの前後の帳簿処理で、保管庫にまだ存在するパスについて発火することがある。
				// そのため、パスが本当に消えたときだけ項目を捨て、リネームが自分の更新を消さないようにする。
				if (this.app.vault.getAbstractFileByPath(file.path)) return;
				this.deleteEntry(file.path);
			}),
		);
		this.refs.push(app.metadataCache.on("resolve", (file) => this.update(file)));
		// FileProvider は、Obsidian がすべてのフロントマターを解析し終える前に作られることがある。
		// その最初のメタデータの処理が終わったら、ファイルを一度読み直す。そうしないと、ノートを編集するまで
		// 別名が空のまま恒久的にキャッシュされてしまうため。
		// 注: `resolved` は後の変更の後にも発火するので、これは完全な作り直しのままにする。1つの
		// ファイルのイベントを取りこぼしても、索引が必ず収束するように。
		this.refs.push(
			app.metadataCache.on("resolved", () => {
				this.app.vault.getFiles().forEach((file) => this.update(file));
			}),
		);
	}

	dispose(): void {
		for (const ref of this.refs) {
			this.app.vault.offref(ref);
			this.app.metadataCache.offref(ref);
		}
		this.refs.length = 0;
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
		// すべての項目を残すので、拡張子の設定が変わっても、メモリ上のキャッシュを更新するだけで済む。
		const metadata = this.app.metadataCache.getFileCache(file);
		const fileAliases = aliases(metadata?.frontmatter?.aliases ?? metadata?.frontmatter?.alias);
		const fileKeywords = normalizeFrontmatterKeywords(metadata?.frontmatter?.keywords);
		const fileTags = normalizeTags([
			...(metadata?.tags ?? []).map(({ tag }) => tag),
			...(parseFrontMatterTags(metadata?.frontmatter) ?? []),
		]);
		const prior = normalizeFrontmatterPrior(metadata?.frontmatter?.prior);
		// 検索のメタデータは、表示されているファイルと Obsidian の除外ファイルで一貫させる。H1 は、
		// 安定したノートの識別子ではないので、意図的に除く。数値の `prior` は並び順だけを決めるので、
		// 別に保持する。
		this.setEntry({
			file,
			path: file.path,
			basename: file.basename,
			aliases: fileAliases,
			keywords: fileKeywords,
			tags: fileTags,
			prior,
			extension: file.extension,
			text: [file.basename, file.path, ...fileAliases, ...fileKeywords].join(" "),
			mtime: file.stat.mtime,
			ignored: false,
		});
	}

	async search({ query, includeIgnored = false }: PaletteSearchRequest): Promise<FileResult[]> {
		const recentPaths = this.app.workspace.getLastOpenFiles?.() ?? [];
		const recent = new Map(recentPaths.map((filePath, index) => [filePath, index]));
		const usageScores = this.usageHistory?.getScores();
		const ignoreFilters = getUserIgnoreFilters(this.app);
		// プラグイン共通の除外フォルダーは、Obsidian の除外設定と合わせて判定する。
		// includeIgnored 指定時のみ両方をまとめて解除し、通常検索では常に除外する。
		// 「除外されたファイルを含める」の接頭辞は明示的な広い検索なので、上限のない索引を使い、
		// 通常の拡張子設定では外れる種類のファイルも含める。
		const entries = [
			...(includeIgnored ? this.allEntries.values() : this.cache.values()),
		].filter(
			(entry) =>
				!isUserIgnoredPathWithFilters(ignoreFilters, entry.path) &&
				(includeIgnored || !isExcludedFolder(this.excludedFolders, entry.path)) &&
				this.isVisibleExtension(entry.extension),
		);
		if (includeIgnored) {
			// 明示的な接頭辞は、空のクエリの一覧も許可する。パレットの結果の上限が UI を有限に保ち、
			// 並べ替えが Obsidian の除外ファイルを通常の Vault の項目の前に置く。
			for (const ignored of await this.ignoredIndex.getEntries()) {
				if (!this.isVisibleExtension(ignored.extension)) continue;
				const entry: FileSearchEntry = {
					path: ignored.path,
					basename: ignored.basename,
					aliases: ignored.aliases,
					keywords: ignored.keywords,
					tags: ignored.tags,
					prior: ignored.prior,
					extension: ignored.extension,
					text: [
						ignored.basename,
						ignored.path,
						...ignored.aliases,
						...ignored.keywords,
					].join(" "),
					mtime: ignored.mtime,
					ignored: true,
				};
				// インデックスされた Vault のファイルと Obsidian の除外ファイルの両方で、拡張子の絞り込みを揃える。
				entries.push(entry);
			}
		}
		const matchOptions = { foldKana: this.foldKana() };
		if (!hasPositiveQueryTerms(query)) {
			// 空の検索と入力した検索は、閲覧の目的が違う。そのため、それぞれが検索時に独自の優先度の
			// 並びを読み、設定の編集をすぐ反映できるようにする。除外だけのクエリは、順位付けの
			// 手がかりがないので、残りのものを空のクエリの並びで閲覧する。
			const remaining = searchFuzzyQuery(
				query,
				entries,
				fileSearchKeys(false),
				matchOptions,
			).map(({ obj }) => obj);
			const files = sortFilesWithoutQuery(
				remaining,
				recent,
				this.fileSortPriorities().blank,
				usageScores,
				this.demotedPriorFolders(),
			);
			return files.map((entry) => this.result(entry));
		}
		// ブール演算子はローカルで解決する。Everything は、同じ構文をすでに持って解釈しているので、意図的に触れない。
		const tagOnlyQuery = isTagOnlyQuery(query);
		const inputSortPriorities = this.fileSortPriorities().input;
		const usesMatchCoverage = inputSortPriorities.includes(FILE_SORT_PRIORITIES.matchCoverage);
		// ハッシュ付きのクエリは、明示的なタグの検索である。候補のフィールドを絞ると、`#project` を
		// 閲覧しているときに `project-plan.md` のようなファイル名が、タグ付きのノートのふりをするのを防ぐ。
		const candidates = tagOnlyQuery
			? entries.filter((entry) => entry.tags.length > 0)
			: entries;
		const matches = searchFuzzyQueryWithFieldScores(
			query,
			candidates,
			fileSearchKeys(tagOnlyQuery),
			matchOptions,
		).map((match) =>
			createFileMatch(match, query, { tagOnlyQuery, usesMatchCoverage, ...matchOptions }),
		);
		const matchesByPath = new Map(matches.map((match) => [match.obj.path, match]));
		return sortFileMatches(
			matches,
			tagOnlyQuery ? undefined : query,
			recent,
			inputSortPriorities,
			usageScores,
			this.demotedPriorFolders(),
		).map((entry) => {
			const match = matchesByPath.get(entry.path);
			return this.result(entry, match?.matchedTags, match?.matchedKeywords);
		});
	}

	private result(
		entry: FileSearchEntry,
		matchedTags?: readonly string[],
		matchedKeywords?: readonly string[],
	): FileResult {
		return {
			id: entry.path,
			mode: "file",
			primary: [entry.basename, ...entry.aliases].join(" / "),
			secondary: entry.path,
			icon: fileIcon(entry.extension),
			vaultPath: entry.path,
			file: entry.file,
			ignored: entry.ignored,
			matchedTags: matchedTags?.length ? [...matchedTags] : undefined,
			matchedKeywords: matchedKeywords?.length ? [...matchedKeywords] : undefined,
			// 表の並べ替えは、インデックスされたファイルと Obsidian の除外ファイルで同じメタデータを使う必要がある。
			mtime: entry.mtime,
			prior: entry.prior,
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

	/** Obsidian で開けない拡張子を、設定が有効なときだけ隠す。 */
	private isVisibleExtension(extension: string): boolean {
		return !this.openableFilesOnly() || isExtensionOpenable(this.app, extension);
	}

	private isAllowedExtension(extension: string): boolean {
		const allowed = this.allowedExtensions;
		return allowed.size === 0 || allowed.has(extension.toLocaleLowerCase());
	}
}
