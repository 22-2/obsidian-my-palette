import {
	getFrontMatterInfo,
	parseFrontMatterEntry,
	parseYaml,
	TFile,
	type App,
	normalizePath,
} from "obsidian";
import { getVaultNewFileFolderPath, isUserIgnoredPath } from "src/core/ignoredPaths";

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

function sourceFromFrontmatter(content: string): string | undefined {
	const info = getFrontMatterInfo(content);
	if (!info.exists) return undefined;
	try {
		const value = parseFrontMatterEntry(parseYaml(info.frontmatter), IMPORT_SOURCE_PROPERTY);
		return typeof value === "string" ? value : undefined;
	} catch {
		return undefined;
	}
}

async function ensureFolder(app: App, folderPath: string): Promise<void> {
	if (!folderPath) return;
	let current = "";
	for (const segment of folderPath.split("/").filter(Boolean)) {
		current = current ? `${current}/${segment}` : segment;
		if (app.vault.getFolderByPath(current)) continue;
		await app.vault.createFolder(current);
	}
}

async function findAvailablePath(
	app: App,
	destination: string,
	sourcePath: string,
): Promise<string> {
	let candidate = destination;
	let suffix = 1;
	while (true) {
		const existing = app.vault.getAbstractFileByPath(candidate);
		if (!(existing instanceof TFile)) return candidate;
		try {
			if (sourceFromFrontmatter(await app.vault.read(existing)) === sourcePath)
				return candidate;
		} catch {
			// A stale file is handled as a collision and receives a deterministic suffix.
		}
		candidate = withSuffix(destination, suffix);
		suffix += 1;
	}
}

function addImportFrontmatter(content: string, sourcePath: string, importedAt: string): string {
	const info = getFrontMatterInfo(content);
	if (info.exists) return content;
	return [
		"---",
		`${IMPORT_SOURCE_PROPERTY}: ${JSON.stringify(sourcePath)}`,
		`${IMPORTED_AT_PROPERTY}: ${JSON.stringify(importedAt)}`,
		"---",
		content,
	].join("\n");
}

/** Copies an ignored Markdown note into the configured new-note folder. */
export async function materializeIgnoredNote(
	app: App,
	sourcePath: string,
	log: IgnoredNoteMaterializerLogger = () => undefined,
): Promise<TFile> {
	const normalizedSourcePath = normalizePath(sourcePath);
	if (!isUserIgnoredPath(app, normalizedSourcePath))
		throw new Error("Only notes under Excluded files can be imported.");
	if (!normalizedSourcePath.toLocaleLowerCase().endsWith(".md"))
		throw new Error("Only Markdown notes can be imported.");

	const sourceContent = await app.vault.adapter.read(normalizedSourcePath);
	// An empty newFileFolderPath means Vault root; use a dedicated fallback so an
	// ignored source is never copied over itself when the setting is unset.
	const destinationFolder = getVaultNewFileFolderPath(app) || "_Imported";
	const destination = normalizePath(
		[destinationFolder, normalizedSourcePath].filter(Boolean).join("/"),
	);
	await ensureFolder(app, destination.slice(0, destination.lastIndexOf("/")));
	const destinationPath = await findAvailablePath(app, destination, normalizedSourcePath);
	const importedAt = new Date().toISOString();
	const importedFile = await app.vault.create(
		destinationPath,
		addImportFrontmatter(sourceContent, normalizedSourcePath, importedAt),
	);
	if (getFrontMatterInfo(sourceContent).exists) {
		await app.fileManager.processFrontMatter(importedFile, (frontmatter) => {
			const properties = frontmatter as Record<string, unknown>;
			properties[IMPORT_SOURCE_PROPERTY] = normalizedSourcePath;
			properties[IMPORTED_AT_PROPERTY] = importedAt;
		});
	}
	log("Imported ignored note", { sourcePath: normalizedSourcePath, destinationPath });
	return importedFile;
}
