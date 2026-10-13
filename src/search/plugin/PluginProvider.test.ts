import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";
import { PluginProvider } from "src/search/plugin/PluginProvider";

vi.mock("obsidian", () => ({
	Platform: { isDesktopApp: true },
	normalizePath: (path: string) => path,
}));

function app(): App {
	return {
		plugins: {
			manifests: {
				beta: { id: "beta", name: "Beta Plugin", version: "2.0.0", dir: "plugins/beta" },
				alpha: {
					id: "alpha",
					name: "Alpha Plugin",
					version: "1.0.0",
					dir: "plugins/alpha",
				},
			},
			plugins: {
				alpha: {},
			},
		},
		setting: {
			settingTabs: {
				alpha: {},
			},
		},
		vault: {
			adapter: {
				getFullPath: (vaultPath: string) => `C:/vault/${vaultPath}`,
			},
		},
	} as unknown as App;
}

describe("PluginProvider", () => {
	it("lists plugins by name with folder paths and availability marks", async () => {
		const results = await new PluginProvider(app()).search({
			mode: "plugin",
			query: "",
		});
		expect(results.map((result) => result.pluginId)).toEqual(["alpha", "beta"]);
		expect(results[0]).toMatchObject({
			primary: "Alpha Plugin",
			absolutePath: "C:/vault/plugins/alpha",
			vaultPath: "plugins/alpha",
			enabled: true,
			hasSettings: true,
		});
		expect(results[1]?.secondary).toContain("(disabled)");
		expect(results[1]).toMatchObject({ enabled: false, hasSettings: false });
	});

	it("searches names and ids with fuzzy matching", async () => {
		const provider = new PluginProvider(app());
		expect(
			(await provider.search({ mode: "plugin", query: "alp" })).map(
				(result) => result.pluginId,
			),
		).toEqual(["alpha"]);
		expect(
			(await provider.search({ mode: "plugin", query: "beta" })).map(
				(result) => result.pluginId,
			),
		).toEqual(["beta"]);
	});
});
