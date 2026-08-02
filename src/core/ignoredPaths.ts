import { normalizePath, type App } from "obsidian";

type ConfigurableVault = App["vault"] & {
	getConfig: (key: string) => unknown;
	adapter: App["vault"]["adapter"] & {
		getBasePath?: () => string;
		getFullPath?: (vaultPath: string) => string;
		path: {
			relative(from: string, to: string): string;
			sep: string;
			isAbsolute(path: string): boolean;
		};
	};
};

export function getUserIgnoreFilters(app: App): string[] {
	const configured = (app.vault as ConfigurableVault).getConfig("userIgnoreFilters");
	if (!Array.isArray(configured)) return [];
	return configured
		.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
		.map((value) => normalizePath(value.trim().replace(/^\/+/, "")).replace(/\/$/, ""));
}

export function isUserIgnoredPath(app: App, vaultPath: string): boolean {
	const normalizedPath = normalizePath(vaultPath);
	return getUserIgnoreFilters(app).some(
		(ignored) => normalizedPath === ignored || normalizedPath.startsWith(`${ignored}/`),
	);
}

export function getVaultFullPath(app: App, vaultPath: string): string | null {
	return (app.vault as ConfigurableVault).adapter.getFullPath?.(vaultPath) ?? null;
}

export function getVaultRootPath(app: App): string | null {
	return (app.vault as ConfigurableVault).adapter.getBasePath?.() ?? null;
}

export function vaultPathFromAbsolute(app: App, absolutePath: string): string | null {
	const basePath = (app.vault as ConfigurableVault).adapter.getBasePath?.();
	if (!basePath) return null;
	const path = (app.vault as ConfigurableVault).adapter.path;
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
