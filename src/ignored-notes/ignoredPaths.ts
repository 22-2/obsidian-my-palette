import { normalizePath, type App } from "obsidian";
import { getDesktopAdapter } from "src/platform/desktopAdapter";
import { isUserIgnoredPathWithFilters } from "src/ignored-notes/ignoredPathMatching";
import {
	getVaultBasePath,
	getVaultConfig,
	getVaultFullPath as getInternalVaultFullPath,
} from "src/platform/obsidianInternals";

export {
	isUserIgnoreFilterRegex,
	isUserIgnoredPathWithFilters,
} from "src/ignored-notes/ignoredPathMatching";

export function getUserIgnoreFilters(app: App): string[] {
	const configured = getVaultConfig(app, "userIgnoreFilters");
	if (!Array.isArray(configured)) return [];
	return configured.flatMap((value): string[] => {
		if (typeof value !== "string" || !value.trim()) return [];
		const trimmed = value.trim();
		// Obsidian accepts slash-delimited regular expressions; keep their delimiters
		// so callers do not mistake a pattern for a literal folder path.
		if (trimmed.length >= 2 && trimmed.startsWith("/") && trimmed.endsWith("/"))
			return [trimmed];
		const normalized = normalizePath(trimmed.replace(/^\/+/, "")).replace(/\/$/, "");
		return normalized ? [normalized] : [];
	});
}

export function isUserIgnoredPath(app: App, vaultPath: string): boolean {
	return isUserIgnoredPathWithFilters(getUserIgnoreFilters(app), vaultPath);
}

export function getVaultFullPath(app: App, vaultPath: string): string | null {
	return getInternalVaultFullPath(app, vaultPath) ?? null;
}

export function getVaultRootPath(app: App): string | null {
	return getVaultBasePath(app.vault) ?? null;
}

export function getVaultNewFileFolderPath(app: App): string {
	const configured = getVaultConfig(app, "newFileFolderPath");
	if (typeof configured !== "string" || !configured.trim()) return "";
	return normalizePath(configured.trim().replace(/^\/+/, "")).replace(/\/$/, "");
}

export function vaultPathFromAbsolute(app: App, absolutePath: string): string | null {
	const basePath = getVaultBasePath(app.vault);
	if (!basePath) return null;
	const path = getDesktopAdapter(app).path;
	const relative = path.relative(basePath, absolutePath);
	if (!relative || relative === ".") return "";
	if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
		return null;
	return normalizePath(relative);
}

export function isAbsolutePathUserIgnored(app: App, absolutePath: string): boolean {
	const vaultPath = vaultPathFromAbsolute(app, absolutePath);
	return vaultPath !== null && isUserIgnoredPath(app, vaultPath);
}
