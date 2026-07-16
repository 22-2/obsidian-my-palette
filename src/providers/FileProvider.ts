import { prepareFuzzySearch, type App, type EventRef, type TFile } from "obsidian";
import type { FileResult } from "../model/results";
import type { PaletteProvider } from "./PaletteProvider";

interface SearchEntry {
	file: TFile;
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
	constructor(private readonly app: App) {
		this.rebuild();
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
			text: [
				file.basename,
				file.path,
				...aliases(metadata?.frontmatter?.aliases ?? metadata?.frontmatter?.alias),
				h1,
			].join(" "),
		});
	}
	async search(query: string): Promise<FileResult[]> {
		const recentPaths = this.app.workspace.getLastOpenFiles?.() ?? [];
		const recent = new Map(recentPaths.map((filePath, index) => [filePath, index]));
		if (!query.trim()) {
			const recentFiles = recentPaths
				.map((filePath) => this.app.vault.getAbstractFileByPath(filePath))
				.filter((file): file is TFile => Boolean(file && "extension" in file));
			const files = recentFiles.length
				? recentFiles
				: [...this.cache.values()]
						.map(({ file }) => file)
						.sort((a, b) => a.path.localeCompare(b.path));
			return files.slice(0, 20).map((file) => this.result(file));
		}
		const fuzzy = prepareFuzzySearch(query);
		return [...this.cache.values()]
			.map((entry) => {
				const nameMatch = fuzzy(entry.file.basename);
				const pathMatch = fuzzy(entry.file.path);
				const allMatch = fuzzy(entry.text);
				const score = nameMatch
					? nameMatch.score +
						2000 +
						(entry.file.basename
							.toLocaleLowerCase()
							.startsWith(query.toLocaleLowerCase())
							? 1000
							: 0)
					: pathMatch
						? pathMatch.score + 500
						: (allMatch?.score ?? -Infinity);
				return { entry, score };
			})
			.filter(({ score }) => Number.isFinite(score))
			.sort(
				(a, b) =>
					b.score - a.score ||
					(recent.get(a.entry.file.path) ?? Infinity) -
						(recent.get(b.entry.file.path) ?? Infinity) ||
					a.entry.file.path.localeCompare(b.entry.file.path),
			)
			.slice(0, 50)
			.map(({ entry }) => this.result(entry.file));
	}
	private result(file: TFile): FileResult {
		return {
			id: file.path,
			mode: "file",
			primary: file.basename,
			secondary: file.path,
			icon: file.extension === "md" ? "file-text" : "file",
			vaultPath: file.path,
			file,
		};
	}
}
