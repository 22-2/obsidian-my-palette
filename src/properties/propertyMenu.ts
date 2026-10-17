import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { propertyTargetPaths, type PropertyResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { readList } from "src/properties/propertyList";
import { updateFrontmatter } from "src/shared/frontmatter";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";
import { logger } from "src/shared/logger";
import { getGlobalSearch } from "src/platform/obsidianInternals";
import { t } from "src/i18n";

/**
 * プロパティの値としてコピーされるテキスト。リストは1行に1項目ずつコピーし、入れ子の値は JSON として
 * コピーする。ユーザーが必要とする構造をコピーの結果に残すため。
 */
export function propertyValueText(kind: PropertyResult["kind"], value: unknown): string {
	if (kind === "list" || kind === "tags") return readList(value).join("\n");
	if (value === undefined || value === null) return "";
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
		return String(value);
	return JSON.stringify(value);
}

/** プロパティの行の右クリック操作。「編集」は Enter と同じ。 */
export function populatePropertyMenu(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	result: PropertyResult,
	edit: () => void,
	beforeSearch?: () => void,
): void {
	menu.addItem((item) => withAction(item, MENU_ACTIONS.editProperty).onClick(edit));
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.openPropertyInSearch).onClick(() =>
			openPropertySearch(plugin.app, result.key, beforeSearch),
		),
	);
	const targetCount = propertyTargetPaths(result).length;
	if (result.inNote && targetCount > 1) {
		addBulkDeleteItem(menu, plugin.app, result, targetCount);
	} else if (result.inNote) {
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.copyPropertyValue).onClick(
				() => void copyValue(plugin.app, result),
			),
		);
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.deleteProperty).onClick(
				() => void deleteProperty(plugin.app, result),
			),
		);
	}
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.copyPropertyName).onClick(
			() => void copyText(result.key, t("property.notice.nameCopied")),
		),
	);
}

function openPropertySearch(app: App, key: string, beforeSearch?: () => void): void {
	const search = getGlobalSearch(app);
	if (!search) {
		new Notice(t("property.error.noSearchPlugin"));
		return;
	}
	beforeSearch?.();
	search.openGlobalSearch(`[${JSON.stringify(key)}]`, true);
}

async function copyValue(app: App, result: PropertyResult): Promise<void> {
	const file = app.vault.getFileByPath(result.sourcePath);
	const value: unknown = file
		? app.metadataCache.getFileCache(file)?.frontmatter?.[result.key]
		: undefined;
	await copyText(propertyValueText(result.kind, value), t("property.notice.valueCopied"));
}

async function copyText(text: string, message: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(message);
	} catch (error) {
		logger.error("Failed to copy to the clipboard", error);
		new Notice(t("property.error.copyFailed"));
	}
}

/** 複数のノートからキーを削除するのは元に戻せないので、もう一度押す必要がある。 */
function addBulkDeleteItem(
	menu: PaletteMenu,
	app: App,
	result: PropertyResult,
	targetCount: number,
): void {
	menu.addConfirmedItem({
		title: t("property.menu.deleteFromMany", { count: targetCount }),
		confirmTitle: t("property.menu.confirmDeleteMany", { count: targetCount }),
		id: "delete-property-from-many",
		icon: ICONS.delete,
		run: () => void deleteProperties(app, result),
	});
}

/** 一覧が対象とするノートのうち、キーを持つすべてのノートからキーを削除する。1つのノートが失敗しても残りは続ける。 */
export async function deleteProperties(app: App, result: PropertyResult): Promise<void> {
	const files = propertyTargetPaths(result).flatMap((path) => {
		const file: TFile | null = app.vault.getFileByPath(path);
		const frontmatter: Record<string, unknown> | undefined = file
			? app.metadataCache.getFileCache(file)?.frontmatter
			: undefined;
		return file && frontmatter && result.key in frontmatter ? [file] : [];
	});
	let deleted = 0;
	let failed = 0;
	for (const file of files) {
		const updated = await updateFrontmatter(
			app,
			file,
			`delete the property ${result.key} of`,
			(frontmatter) => {
				delete frontmatter[result.key];
			},
		);
		if (updated) deleted += 1;
		else failed += 1;
	}
	if (deleted > 0)
		new Notice(t("property.notice.deletedFromMany", { key: result.key, count: deleted }));
	if (failed > 0) new Notice(t("property.error.updateFailedMany", { count: failed }));
	if (deleted === 0 && failed === 0)
		new Notice(t("property.notice.noneHasKey", { key: result.key }));
}

/** 一覧を作ったノートから、キーを削除する。 */
async function deleteProperty(app: App, result: PropertyResult): Promise<void> {
	const file: TFile | null = app.vault.getFileByPath(result.sourcePath);
	if (!file) {
		new Notice(t("property.error.noteGone"));
		return;
	}
	const updated = await updateFrontmatter(
		app,
		file,
		`delete the property ${result.key} of`,
		(frontmatter) => {
			delete frontmatter[result.key];
		},
	);
	if (updated)
		new Notice(t("property.notice.deletedFromOne", { key: result.key, name: file.basename }));
	else new Notice(t("property.error.updateFailed", { name: file.basename }));
}
