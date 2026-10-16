import type { App, KeymapEventHandler, Scope } from "obsidian";

/*
 * Every Obsidian API that is not in the public `obsidian` typings goes through this
 * module. Why: these APIs can change or disappear in any Obsidian release, so each
 * accessor checks what it reads and falls back to an empty or missing value instead
 * of throwing. When an update breaks one, this is the only file to fix.
 */

/** Optional members, so a missing internal reads as undefined instead of throwing. */
interface AppInternals {
	commands?: {
		commands?: Record<string, { id: string; name: string }>;
		executeCommandById?: (id: string) => boolean;
	};
	plugins?: {
		manifests?: Record<string, CommunityPluginManifest>;
		plugins?: Record<string, unknown>;
	};
	internalPlugins?: {
		getEnabledPluginById?: (id: string) => unknown;
	};
	customCss?: CustomCssInternals;
	setting?: SettingWindowInternals;
	metadataTypeManager?: MetadataTypeManagerInternals;
	metadataCache?: {
		getFrontmatterPropertyValuesForKey?: (key: string) => unknown;
	};
	vault?: {
		getConfig?: (key: string) => unknown;
	};
}

interface AdapterInternals {
	getBasePath?: () => string;
	getFullPath?: (vaultPath: string) => string;
}

export interface CommunityPluginManifest {
	id: string;
	name: string;
	version: string;
	dir?: string;
}

export interface CustomCssInternals {
	snippets?: unknown;
	enabledSnippets?: unknown;
	getSnippetsFolder?: () => string;
	getSnippetPath?: (snippet: string) => string;
}

export interface SettingWindowInternals {
	open(): void;
	openTabById(id: string): void;
	/** Tabs that plugins register; settingTabs holds only Obsidian's own pages. */
	pluginTabs?: readonly { id?: string }[];
}

export interface VaultPropertyInfo {
	type?: unknown;
	widget?: unknown;
}

export interface MetadataTypeManagerInternals {
	getAllProperties?: () => Record<string, VaultPropertyInfo>;
	getPropertyOccurrences?: () => Record<string, number>;
	getAssignedWidget?: (key: string) => unknown;
}

/** The core Search plugin's entry point. */
export interface GlobalSearchInternals {
	openGlobalSearch(query: string, active: boolean): void;
}

function internals(app: App): AppInternals {
	return app as unknown as AppInternals;
}

/** Every registered command, including other plugins' and Obsidian's own. */
export function getCommands(app: App): { id: string; name: string }[] {
	return Object.values(internals(app).commands?.commands ?? {});
}

/** Runs a command by id; false when it is unknown or the API is missing. */
export function executeCommandById(app: App, id: string): boolean {
	return internals(app).commands?.executeCommandById?.(id) ?? false;
}

/** Installed community plugins, enabled or not. */
export function getCommunityPluginManifests(app: App): CommunityPluginManifest[] {
	return Object.values(internals(app).plugins?.manifests ?? {});
}

/** The loaded instance of an enabled community plugin. */
export function getCommunityPlugin<T = unknown>(app: App, id: string): T | undefined {
	return (internals(app).plugins?.plugins?.[id] as T | undefined) ?? undefined;
}

/** The instance of an enabled core plugin, or undefined when it is off. */
export function getEnabledCorePlugin<T = unknown>(app: App, id: string): T | undefined {
	return (internals(app).internalPlugins?.getEnabledPluginById?.(id) as T | null) ?? undefined;
}

export function getGlobalSearch(app: App): GlobalSearchInternals | undefined {
	return getEnabledCorePlugin<GlobalSearchInternals>(app, "global-search");
}

/** CSS snippet state; an empty object when the API is missing. */
export function getCustomCss(app: App): CustomCssInternals {
	return internals(app).customCss ?? {};
}

export function getSettingWindow(app: App): SettingWindowInternals | undefined {
	return internals(app).setting;
}

export function getMetadataTypeManager(app: App): MetadataTypeManagerInternals | undefined {
	return internals(app).metadataTypeManager;
}

/** The values used for a frontmatter key anywhere in the vault, unvalidated. */
export function getFrontmatterValuesForKey(app: App, key: string): unknown {
	return internals(app).metadataCache?.getFrontmatterPropertyValuesForKey?.(key);
}

/** A setting from Files and links, such as `userIgnoreFilters`, unvalidated. */
export function getVaultConfig(app: App, key: string): unknown {
	return internals(app).vault?.getConfig?.(key);
}

/** The vault folder on disk; undefined off desktop. Takes the vault alone so tests can pass one. */
export function getVaultBasePath(vault: { adapter: object }): string | undefined {
	return (vault.adapter as AdapterInternals).getBasePath?.();
}

/** The absolute path of a vault path; undefined off desktop. */
export function getVaultFullPath(app: App, vaultPath: string): string | undefined {
	return (app.vault.adapter as AdapterInternals).getFullPath?.(vaultPath);
}

/** The handlers registered on a scope, so built-in ones can be replaced. */
export function getScopeHandlers(scope: Scope): readonly KeymapEventHandler[] {
	return [...((scope as unknown as { keys?: KeymapEventHandler[] }).keys ?? [])];
}
