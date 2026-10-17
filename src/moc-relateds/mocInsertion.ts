import { Notice, TFile, type WorkspaceLeaf } from "obsidian";
import type { PaletteMenu } from "src/ui/paletteMenu";
import type MyPalettePlugin from "src/main";
import type { PaletteResult } from "src/palette/results";
import {
	insertFileToActiveMocRelateds,
	insertFileToMocRelateds,
} from "src/moc-relateds/mocRelateds";
import { materializeIgnoredNote } from "src/ignored-notes/ignoredNoteMaterializer";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { t } from "src/i18n";

/** パレットの結果を、共有の MOC メニュー操作のための Vault のノートに解決する。 */
async function resolveMocTarget(
	plugin: MyPalettePlugin,
	result: PaletteResult,
): Promise<TFile | undefined> {
	if (result.mode === "file") {
		if (result.ignored) {
			try {
				return await materializeIgnoredNote(plugin.app, result.vaultPath);
			} catch (error) {
				new Notice(error instanceof Error ? error.message : t("moc.failedImport"));
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
		result.mode === "audit" ||
		result.mode === "search-history" ||
		result.mode === "mode-entry"
	)
		return undefined;
	return result.file;
}

export interface MocInsertionContext {
	mocFile: TFile | null;
	mocLeaf?: WorkspaceLeaf;
}

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
				for (const result of insertableResults) {
					const target = await resolveMocTarget(plugin, result);
					if (target) targets.set(target.path, target);
					else unavailableCount++;
				}
				if (unavailableCount === 1 && insertableResults.length === 1)
					new Notice(t("moc.notAvailableNote"));
				else if (unavailableCount > 0)
					new Notice(t("moc.someNotAvailable", { count: unavailableCount }));
				if (!targets.size) return;
				const context = getContext?.();
				// Why: 挿入のたびに共有の MOC を読んで更新するので、対象を
				// 順番に処理して、ある選択が別の選択の変更を上書きしないようにする。
				for (const target of targets.values()) {
					if (context)
						await insertFileToMocRelateds(
							plugin,
							context.mocFile,
							target,
							context.mocLeaf,
						);
					else await insertFileToActiveMocRelateds(plugin, target);
				}
			})();
		}),
	);
}
