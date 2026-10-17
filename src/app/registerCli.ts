import type { CliData, CliFlags } from "obsidian";
import { auditCliApi } from "src/audit/auditCli";
import type MyPalettePlugin from "src/main";

/**
 * An API for the Obsidian CLI, registered as `obsidian my-palette:<action> ...`.
 * The value `run` returns is printed as JSON.
 */
export interface CliApi {
	action: string;
	description: string;
	flags: CliFlags;
	run: (plugin: MyPalettePlugin, params: CliData) => Promise<unknown>;
}

const CLI_APIS: readonly CliApi[] = [auditCliApi];

/** The plugin ID alone lists the APIs, so a caller can find them without the README. */
export function registerCli(plugin: MyPalettePlugin): void {
	const pluginId = plugin.manifest.id;
	plugin.registerCliHandler(pluginId, "List My Palette CLI APIs as JSON", null, () =>
		toJson(
			CLI_APIS.map(({ action, description, flags }) => ({
				command: `${pluginId}:${action}`,
				description,
				flags,
			})),
		),
	);
	for (const api of CLI_APIS) {
		plugin.registerCliHandler(
			`${pluginId}:${api.action}`,
			api.description,
			api.flags,
			async (params) => {
				// Why: a thrown error reaches the caller without its message, so return it as JSON.
				try {
					return toJson(await api.run(plugin, params));
				} catch (error) {
					console.error(`[my-palette] CLI ${api.action}`, error);
					return toJson({
						error: error instanceof Error ? error.message : String(error),
					});
				}
			},
		);
	}
}

function toJson(value: unknown): string {
	return JSON.stringify(value, null, 2);
}
