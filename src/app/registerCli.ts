import type { CliApi } from "src/platform/cliApi";
import { auditCliApi } from "src/features/audit/auditCli";
import { renameCliApi } from "src/features/rename/renameCli";
import { moveCliApi } from "src/features/move/moveCli";
import { trashCliApi } from "src/features/trash/trashCli";
import { tagCliApi } from "src/features/tags/tagCli";
import { listPropertyCliApi } from "src/features/properties/listPropertyCli";
import { scalarPropertyCliApi } from "src/features/properties/scalarPropertyCli";
import { mergeCliApi } from "src/features/merge/mergeCli";
import { mocCliApi, mocRemoveCliApi } from "src/features/moc-relateds/mocCli";
import { renameTagCliApi, deleteTagsCliApi } from "src/features/tags/globalTagCli";
import type MyPalettePlugin from "src/main";
import { logger } from "src/core/logger";
import { t } from "src/i18n";

const CLI_APIS: readonly CliApi[] = [
	auditCliApi,
	renameCliApi,
	moveCliApi,
	trashCliApi,
	tagCliApi,
	listPropertyCliApi,
	scalarPropertyCliApi,
	mergeCliApi,
	mocCliApi,
	mocRemoveCliApi,
	renameTagCliApi,
	deleteTagsCliApi,
];

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
