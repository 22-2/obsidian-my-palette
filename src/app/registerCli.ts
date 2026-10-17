import type { CliData, CliFlags } from "obsidian";
import { auditCliApi } from "src/audit/auditCli";
import type MyPalettePlugin from "src/main";
import { logger } from "src/shared/logger";
import { t } from "src/i18n";

/**
 * Obsidian CLI の API。`obsidian my-palette:<action> ...` として登録される。
 * `run` が返した値は JSON として出力する。
 */
export interface CliApi {
	action: string;
	description: string;
	flags: CliFlags;
	run: (plugin: MyPalettePlugin, params: CliData) => Promise<unknown>;
}

const CLI_APIS: readonly CliApi[] = [auditCliApi];

/** プラグイン ID だけで API の一覧を出せるので、README を見なくても呼び出し先を見つけられる。 */
export function registerCli(plugin: MyPalettePlugin): void {
	const pluginId = plugin.manifest.id;
	plugin.registerCliHandler(pluginId, t("cli.listDescription"), null, () =>
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
				// Why: 投げられたエラーは呼び出し元にメッセージが届かないため、JSON で返す。
				try {
					return toJson(await api.run(plugin, params));
				} catch (error) {
					logger.error(`CLI ${api.action}`, error);
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
