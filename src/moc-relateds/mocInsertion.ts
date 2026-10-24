import { Notice, TFile } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import {
	getActiveMocInsertionContext,
	insertFilesToMocRelateds,
	showMocBatchInsertionNotice,
} from "src/moc-relateds/mocRelateds";
import type { MocInsertionContext } from "src/moc-relateds/mocRelateds";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { t } from "src/i18n";

/** パレットの結果を、共有の MOC メニュー操作のための Vault のノートに解決する。 */
async function resolveMocTarget(
	plugin: MyPalettePlugin,
	result: PaletteResult,
	onFailure?: (message: string) => void,
): Promise<TFile | undefined> {
	if (result.mode === "file") {
		if (result.ignored) {
			try {
				return await materializeIgnoredNote(plugin.app, result.vaultPath);
			} catch (error) {
				const message = error instanceof Error ? error.message : t("moc.failedImport");
				if (onFailure) onFailure(message);
				else new Notice(message);
				return undefined;
			}
		}
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		return file instanceof TFile ? file : undefined;
	}
	if (result.mode === "everything") {
		if (!result.vaultPath) return undefined;
		const file = plugin.app.vault.getAbstractFileByPath(result.vaultPath);
		return file instanceof TFile ? file : undefined;
	}
	if (
		result.mode === "command" ||
		result.mode === "plugin" ||
		result.mode === "snippet" ||
		result.mode === "property" ||
		result.mode === "tag" ||
		result.mode === "audit" ||
		result.mode === "search-history" ||
		result.mode === "mode-entry"
	)
		return undefined;
	return result.file;
}

export type { MocInsertionContext } from "src/moc-relateds/mocRelateds";

/** Adds the same MOC insertion action to both the modal and persistent palette menus. */
export function addMocInsertionMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	result: PaletteResult,
	onSelected?: () => void,
	getContext?: () => MocInsertionContext,
): void {
	addMocInsertionMenuItems(menu, plugin, [result], onSelected, getContext);
}

/** Adds one action for eligible notes so a multi-selection shares one MOC destination. */
export function addMocInsertionMenuItems(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
	getContext?: () => MocInsertionContext,
): void {
	const insertableResults = results.filter((result) => {
		if (
			result.mode === "command" ||
			result.mode === "plugin" ||
			result.mode === "snippet" ||
			result.mode === "property" ||
			result.mode === "audit" ||
			result.mode === "search-history" ||
			result.mode === "mode-entry"
		)
			return false;
		if (result.mode === "everything" && (result.kind === "folder" || !result.vaultPath))
			return false;
		return !(result.mode === "bookmark" && result.kind === "search");
	});
	if (!insertableResults.length) return;
	menu.addSeparator();
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.insertIntoMoc).onClick(() => {
			onSelected?.();
			void (async () => {
				const targets = new Map<string, TFile>();
				let unavailableCount = 0;
				const failures: string[] = [];
				for (const result of insertableResults) {
					const target = await resolveMocTarget(plugin, result, (message) =>
						failures.push(message),
					);
					if (target) targets.set(target.path, target);
					else unavailableCount++;
				}
				const context =
					targets.size > 0
						? (getContext?.() ?? getActiveMocInsertionContext(plugin))
						: undefined;
				const mocFile = context?.mocFile ?? null;
				const summary = await insertFilesToMocRelateds(
					plugin,
					mocFile,
					[...targets.values()],
					context?.mocLeaf,
				);
				showMocBatchInsertionNotice(mocFile, summary, {
					unavailableCount,
					details: failures,
				});
			})();
		}),
	);
}
