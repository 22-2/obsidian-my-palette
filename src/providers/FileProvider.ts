import { type App, type EventRef, type TFile } from "obsidian";
import fuzzysort from "fuzzysort";
import * as path from "path";
import { getUserIgnoreFilters, isUserIgnoredPath } from "../core/ignoredPaths";
import type { FileResult } from "../model/results";
import type { PaletteProvider } from "./PaletteProvider";

interface SearchEntry {
	file?: TFile;
	path: string;
	basename: string;
	extension: string;
	text: string;
}

function aliases(value: unknown): string[] {
	if (Array.isArray(value))
		return value.filter((item): item is string => typeof item === "string");
	return typeof value === "string" ? [value] : [];
}

export class FileProvider implements PaletteProvider {
	private readonly cache = new Map<string, SearchEntry>();
	private readonly refs: EventRef[] = [];
	private readonly ignoredReady: Promise<void>;

	constructor(private readonly app: App) {
		this.rebuild();
		this.ignoredReady = this.rebuildIgnored();
		this.refs.push(
			app.vault.on("create", (file) => {
				if ("extension" in file) this.update(file as TFile);
			}),
		);
		this.refs.push(app.vault.on("delete", (file) => this.cache.delete(file.path)));
		this.refs.push(
			app.vault.on("rename", (file, oldPath) => {
				this.cache.delete(oldPath);
				if ("extension" in file) this.update(file as TFile);
			}),
		);
		this.refs.push(app.metadataCache.on("changed", (file) => this.update(file)));
	}

	dispose(): void {
		this.refs.forEach((ref) => this.app.vault.offref(ref));
	}

	private rebuild(): void {
		this.cache.clear();
		this.app.vault.getFiles().forEach((file) => this.update(file));
	}

	private update(file: TFile): void {
		const metadata = this.app.metadataCache.getFileCache(file);
		const h1 = metadata?.headings?.find((heading) => heading.level === 1)?.heading ?? "";
		this.cache.set(file.path, {
			file,
			path: file.path,
			basename: file.basename,
			extension: file.extension,
			text: [
				file.basename,
				file.path,
				...aliases(metadata?.frontmatter?.aliases ?? metadata?.frontmatter?.alias),
				h1,
			].join(" "),
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
		const extension = path.posix.extname(filePath).slice(1);
		const filename = path.posix.basename(filePath);
		const basename = extension ? filename.slice(0, -(extension.length + 1)) : filename;
		this.cache.set(filePath, {
			path: filePath,
			basename,
			extension,
			text: `${basename} ${filePath}`,
		});
	}

	async search(query: string): Promise<FileResult[]> {
		await this.ignoredReady;
		const recentPaths = this.app.workspace.getLastOpenFiles?.() ?? [];
		const recent = new Map(recentPaths.map((filePath, index) => [filePath, index]));
		if (!query.trim()) {
			const recentFiles = recentPaths
				.map((filePath) => this.cache.get(filePath))
				.filter((entry): entry is SearchEntry => Boolean(entry));
			const allFiles = [...this.cache.values()]
				.filter((entry) => !isUserIgnoredPath(this.app, entry.path))
				.sort((a, b) => a.path.localeCompare(b.path));
			const recentPathsSet = new Set(recentFiles.map((entry) => entry.path));
			const files = recentFiles.length
				? [...recentFiles, ...allFiles.filter((entry) => !recentPathsSet.has(entry.path))]
				: allFiles;
			return files.map((entry) => this.result(entry));
		}
		return [
			...fuzzysort.go(query, [...this.cache.values()], {
				keys: [(entry) => entry.basename, (entry) => entry.path, (entry) => entry.text],
				scoreFn: (matches) => Math.max(...matches.map((match) => match?.score ?? 0)),
			}),
		]
			.sort(
				(a, b) =>
					b.score - a.score ||
					(recent.get(a.obj.path) ?? Infinity) - (recent.get(b.obj.path) ?? Infinity) ||
					a.obj.path.localeCompare(b.obj.path),
			)
			.map(({ obj }) => this.result(obj));
	}

	private result(entry: SearchEntry): FileResult {
		return {
			id: entry.path,
			mode: "file",
			primary: entry.basename,
			secondary: entry.path,
			icon: entry.extension === "md" ? "file-text" : "file",
			vaultPath: entry.path,
			file: entry.file,
		};
	}
}
