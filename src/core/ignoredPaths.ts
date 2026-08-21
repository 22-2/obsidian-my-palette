import { normalizePath, type App } from "obsidian";
import { getDesktopAdapter } from "src/core/desktopAdapter";

type ConfigurableVault = App["vault"] & {
	getConfig: (key: string) => unknown;
	adapter: App["vault"]["adapter"] & {
		getBasePath?: () => string;
		getFullPath?: (vaultPath: string) => string;
	};
};

export function getUserIgnoreFilters(app: App): string[] {
	const configured = (app.vault as ConfigurableVault).getConfig("userIgnoreFilters");
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

export function isUserIgnoreFilterRegex(filter: string): boolean {
	return filter.length >= 2 && filter.startsWith("/") && filter.endsWith("/");
}

export function isUserIgnoredPath(app: App, vaultPath: string): boolean {
	const normalizedPath = normalizePath(vaultPath);
	return getUserIgnoreFilters(app).some((ignored) => {
		if (isUserIgnoreFilterRegex(ignored)) {
			try {
				return new RegExp(ignored.slice(1, -1)).test(normalizedPath);
			} catch {
				return false;
			}
		}
		return normalizedPath === ignored || normalizedPath.startsWith(`${ignored}/`);
	});
}

export function getVaultFullPath(app: App, vaultPath: string): string | null {
	return (app.vault as ConfigurableVault).adapter.getFullPath?.(vaultPath) ?? null;
}

export function getVaultRootPath(app: App): string | null {
	return (app.vault as ConfigurableVault).adapter.getBasePath?.() ?? null;
}

export function getVaultNewFileFolderPath(app: App): string {
	const configured = (app.vault as ConfigurableVault).getConfig("newFileFolderPath");
	if (typeof configured !== "string" || !configured.trim()) return "";
	return normalizePath(configured.trim().replace(/^\/+/, "")).replace(/\/$/, "");
}

export function vaultPathFromAbsolute(app: App, absolutePath: string): string | null {
	const basePath = (app.vault as ConfigurableVault).adapter.getBasePath?.();
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
