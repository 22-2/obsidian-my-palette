import {
	getFrontMatterInfo,
	parseFrontMatterEntry,
	parseYaml,
	TFile,
	type App,
	normalizePath,
} from "obsidian";
import { getVaultNewFileFolderPath, isUserIgnoredPath } from "src/ignored-notes/ignoredPaths";

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
	} catch {
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
			// A missing path is created below; adapters may report it by throwing
			// instead of returning null.
		}
		if (stat?.type === "folder" || app.vault.getFolderByPath(current)) continue;
		if (stat?.type === "file")
			throw new Error(`Cannot create import folder because a file exists at ${current}.`);
		try {
			await app.vault.createFolder(current);
		} catch (error) {
			// Hidden folders can be present on disk without a TFolder model entry;
			// re-check the adapter so an idempotent import does not fail on them.
			try {
				if ((await adapter.stat(current))?.type === "folder") continue;
			} catch {
				// Preserve the original createFolder error when the path is still unknown.
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
				// A stale file is handled as a collision and receives a deterministic suffix.
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
			// A missing path is available; adapters may report it by throwing.
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
	// MOC links should leave imported notes directly in the configured folder;
	// mirroring the ignored source directories would create an unexpected nested
	// tree beneath the user's default save destination.
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
	log("Imported ignored note", {
		sourcePath: normalizedSourcePath,
		destinationPath: destinationCandidate.path,
	});
	return importedFile;
}
