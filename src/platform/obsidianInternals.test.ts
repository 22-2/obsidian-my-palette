import type { App, Scope } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import {
	executeCommandById,
	getCommands,
	getCommunityPlugin,
	getCommunityPluginManifests,
	getCustomCss,
	getEnabledCorePlugin,
	getFrontmatterValuesForKey,
	getGlobalSearch,
	getMetadataTypeManager,
	getScopeHandlers,
	getSettingWindow,
	getVaultBasePath,
	getVaultConfig,
	getVaultFullPath,
} from "src/platform/obsidianInternals";

/** An app as a future Obsidian might ship it: none of the internals exist. */
const bareApp = { vault: { adapter: {} }, metadataCache: {} } as unknown as App;

describe("Obsidian internals", () => {
	it("reads commands, plugins and settings when Obsidian provides them", () => {
		const executeCommandByIdSpy = vi.fn().mockReturnValue(true);
		const search = { openGlobalSearch: vi.fn() };
		const app = {
			commands: {
				commands: { "app:reload": { id: "app:reload", name: "Reload" } },
				executeCommandById: executeCommandByIdSpy,
			},
			plugins: {
				manifests: { dataview: { id: "dataview", name: "Dataview", version: "1.0.0" } },
				plugins: { dataview: { enabled: true } },
			},
			internalPlugins: {
				getEnabledPluginById: (id: string) => (id === "global-search" ? search : null),
			},
			vault: {
				getConfig: (key: string) => (key === "newFileFolderPath" ? "Inbox" : undefined),
				adapter: {
					getBasePath: () => "/vault",
					getFullPath: (path: string) => `/vault/${path}`,
				},
			},
			metadataCache: { getFrontmatterPropertyValuesForKey: () => ["a", "b"] },
		} as unknown as App;

		expect(getCommands(app)).toEqual([{ id: "app:reload", name: "Reload" }]);
		expect(executeCommandById(app, "app:reload")).toBe(true);
		expect(executeCommandByIdSpy).toHaveBeenCalledWith("app:reload");
		expect(getCommunityPluginManifests(app).map(({ id }) => id)).toEqual(["dataview"]);
		expect(getCommunityPlugin(app, "dataview")).toEqual({ enabled: true });
		expect(getGlobalSearch(app)).toBe(search);
		expect(getEnabledCorePlugin(app, "bookmarks")).toBeUndefined();
		expect(getVaultConfig(app, "newFileFolderPath")).toBe("Inbox");
		expect(getVaultBasePath(app.vault)).toBe("/vault");
		expect(getVaultFullPath(app, "Note.md")).toBe("/vault/Note.md");
		expect(getFrontmatterValuesForKey(app, "tags")).toEqual(["a", "b"]);
	});

	it("falls back to empty values instead of throwing when the internals are missing", () => {
		expect(getCommands(bareApp)).toEqual([]);
		expect(executeCommandById(bareApp, "app:reload")).toBe(false);
		expect(getCommunityPluginManifests(bareApp)).toEqual([]);
		expect(getCommunityPlugin(bareApp, "dataview")).toBeUndefined();
		expect(getEnabledCorePlugin(bareApp, "bookmarks")).toBeUndefined();
		expect(getGlobalSearch(bareApp)).toBeUndefined();
		expect(getCustomCss(bareApp)).toEqual({});
		expect(getSettingWindow(bareApp)).toBeUndefined();
		expect(getMetadataTypeManager(bareApp)).toBeUndefined();
		expect(getFrontmatterValuesForKey(bareApp, "tags")).toBeUndefined();
		expect(getVaultConfig(bareApp, "userIgnoreFilters")).toBeUndefined();
		expect(getVaultBasePath(bareApp.vault)).toBeUndefined();
		expect(getVaultFullPath(bareApp, "Note.md")).toBeUndefined();
		expect(getScopeHandlers({} as Scope)).toEqual([]);
	});

	it("returns a copy of the scope handlers so callers can unregister while iterating", () => {
		const keys = [{ key: "Escape", modifiers: "" }];
		const handlers = getScopeHandlers({ keys } as unknown as Scope);
		expect(handlers).toEqual(keys);
		expect(handlers).not.toBe(keys);
	});
});
