import {
	getFrontMatterInfo,
	parseFrontMatterEntry,
	parseYaml,
	TFile,
	type App,
	normalizePath,
} from "obsidian";
import { getVaultNewFileFolderPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";

export const IMPORT_SOURCE_PROPERTY = "my-palette-source";
export const IMPORTED_AT_PROPERTY = "my-palette-imported-at";

export type IgnoredNoteMaterializerLogger = (message: string, detail?: unknown) => void;

function fileName(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}

function withSuffix(path: string, suffix: number): string {
	const slash = path.lastIndexOf("/");
	const directory = slash === -1 ? "" : path.slice(0, slash + 1);
	const name = fileName(path);
	const extension = name.toLocaleLowerCase().endsWith(".md") ? ".md" : "";
	const stem = extension ? name.slice(0, -extension.length) : name;
	return `${directory}${stem} (imported ${suffix})${extension}`;
}

function visibleImportPath(path: string): string {
	return normalizePath(
		path
			.split("/")
			.map((segment) => (segment.startsWith(".") ? `_hidden-${segment.slice(1)}` : segment))
			.join("/"),
	);
}

function sourceFromFrontmatter(content: string): string | undefined {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return undefined;
	try {
		const value = parseFrontMatterEntry(parseYaml(info.frontmatter), IMPORT_SOURCE_PROPERTY);
		return typeof value === "string" ? value : undefined;
	} catch (error) {
		logger.debug("Failed to read the import source of a copied note", error);
		return undefined;
	}
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (!folderPath) return;
	const adapter = app.vault.adapter;
	let current = "";
	for (const segment of folderPath.split("/").filter(Boolean)) {
		current = current ? `${current}/${segment}` : segment;
		let stat: Awaited<ReturnType<typeof adapter.stat>> = null;
		try {
			stat = await adapter.stat(current);
		} catch {
			// 存在しないパスは下で作成する。アダプターは null を返す代わりに例外を投げることがあるため。
		}
		if (stat?.type === "folder" || app.vault.getFolderByPath(current)) continue;
		if (stat?.type === "file")
			throw new Error(t("ignored.importFolderConflict", { path: current }));
		try {
			await app.vault.createFolder(current);
		} catch (error) {
			// 隠しフォルダーはディスクにあっても TFolder のモデルに登録されていないことがある。
			// 取り込みを繰り返しても失敗しないよう、アダプターで確認し直す。
			try {
				if ((await adapter.stat(current))?.type === "folder") continue;
			} catch {
				// パスがまだ不明なときは、元の createFolder のエラーをそのまま残す。
			}
			throw error;
		}
	}
}

interface DestinationCandidate {
	path: string;
	existing?: TFile;
}

async function findAvailablePath(
	app: App,
	destination: string,
	sourcePath: string,
): Promise<DestinationCandidate> {
	let candidate = destination;
	let suffix = 1;
	while (true) {
		const existing = app.vault.getAbstractFileByPath(candidate);
		if (existing instanceof TFile) {
			try {
				if (sourceFromFrontmatter(await app.vault.read(existing)) === sourcePath)
					return { path: candidate, existing };
			} catch {
				// 古いファイルは衝突として扱い、決まった連番を付ける。
			}
			candidate = withSuffix(destination, suffix);
			suffix += 1;
			continue;
		}
		if (existing) {
			candidate = withSuffix(destination, suffix);
			suffix += 1;
			continue;
		}
		try {
			if (await app.vault.adapter.stat(candidate)) {
				candidate = withSuffix(destination, suffix);
				suffix += 1;
				continue;
			}
		} catch {
			// 存在しないパスは使える。アダプターは例外で知らせることがあるため。
		}
		return { path: candidate };
	}
}

function addImportFrontmatter(content: string, sourcePath: string, importedAt: string): string {
	const info = getFrontMatterInfo(content);
	const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";
	const properties = [
		`${IMPORT_SOURCE_PROPERTY}: ${JSON.stringify(sourcePath)}`,
		`${IMPORTED_AT_PROPERTY}: ${JSON.stringify(importedAt)}`,
	];
	if (!info.exists) return ["---", ...properties, "---", content].join(lineEnding);
	const existing = content
		.slice(info.from, info.to)
		.replace(/[ \t]+$/gm, "")
		.trimEnd();
	return [content.slice(0, info.from), existing, ...properties, content.slice(info.to)].join(
		lineEnding,
	);
}

/** Obsidian の除外ファイルにある Markdown を、設定された新規ノートのフォルダーにコピーする。 */
export async function materializeIgnoredNote(
	app: App,
	sourcePath: string,
	log: IgnoredNoteMaterializerLogger = () => undefined,
): Promise<TFile> {
	const normalizedSourcePath = normalizePath(sourcePath);
	if (!isUserIgnoredPath(app, normalizedSourcePath)) throw new Error(t("ignored.onlyExcluded"));
	if (!normalizedSourcePath.toLocaleLowerCase().endsWith(".md"))
		throw new Error(t("ignored.onlyMarkdown"));

	const sourceContent = await app.vault.adapter.read(normalizedSourcePath);
	// 新規ノートのフォルダーが空なら Vault のルートを意味する。設定が未入力のときに、
	// 除外されている元ファイルへ上書きコピーしないよう、専用の既定フォルダーを使う。
	const destinationFolder = getVaultNewFileFolderPath(app) || "_Imported";
	// Why: MOC のリンクは、取り込んだノートを設定したフォルダーの直下に置くべき。除外元の
	// フォルダー構造を写すと、ユーザーの既定の保存先の下に想定外の入れ子のフォルダーができるため。
	const destination = visibleImportPath(
		normalizePath(
			[destinationFolder, fileName(normalizedSourcePath)].filter(Boolean).join("/"),
		),
	);
	await ensureFolder(app, destination.slice(0, destination.lastIndexOf("/")));
	const destinationCandidate = await findAvailablePath(app, destination, normalizedSourcePath);
	if (destinationCandidate.existing) return destinationCandidate.existing;
	const importedAt = new Date().toISOString();
	const importedFile = await app.vault.create(
		destinationCandidate.path,
		addImportFrontmatter(sourceContent, normalizedSourcePath, importedAt),
	);
	log("Imported Obsidian-excluded file", {
		sourcePath: normalizedSourcePath,
		destinationPath: destinationCandidate.path,
	});
	return importedFile;
}
