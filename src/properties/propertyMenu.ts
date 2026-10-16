import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { propertyTargetPaths, type PropertyResult } from "src/palette/results";
import type { PaletteMenu, PaletteMenuItem } from "src/ui/paletteMenu";
import { readList } from "src/properties/propertyList";
import { updateFrontmatter } from "src/shared/frontmatter";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";
import { logger } from "src/shared/logger";

/**
 * The text copied for a property value. A list is copied one item per line, and a
 * nested value as JSON, so the copy keeps the structure a user would need.
 */
export function propertyValueText(kind: PropertyResult["kind"], value: unknown): string {
	if (kind === "list" || kind === "tags") return readList(value).join("\n");
	if (value === undefined || value === null) return "";
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
		return String(value);
	return JSON.stringify(value);
}

/** The right-click actions for a property row; Edit matches Enter. */
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
			() => void copyText(result.key, "Property name copied."),
		),
	);
}

function openPropertySearch(app: App, key: string, beforeSearch?: () => void): void {
	const search = app.internalPlugins.getEnabledPluginById("global-search");
	if (!search) {
		new Notice("Enable Obsidian's search core plugin to search properties.");
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
	await copyText(propertyValueText(result.kind, value), "Property value copied.");
}

async function copyText(text: string, message: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(text);
		new Notice(message);
	} catch (error) {
		logger.error("Failed to copy to the clipboard", error);
		new Notice("Could not copy to the clipboard.");
	}
}

/**
 * Deleting a key from several notes cannot be undone, so the first press turns the item into a
 * confirmation that keeps the menu open; the second press deletes and closes.
 */
function addBulkDeleteItem(
	menu: PaletteMenu,
	app: App,
	result: PropertyResult,
	targetCount: number,
): void {
	let confirming = false;
	let deleteItem: PaletteMenuItem | undefined;
	const render = (item: PaletteMenuItem) => {
		item.setTitle(
			confirming
				? `Click again to delete from ${targetCount} notes`
				: `Delete property from ${targetCount} notes`,
		)
			.setIcon(ICONS.delete)
			.setWarning(true)
			.setCta(confirming)
			.setKeepOpen(confirming);
	};
	menu.addItem((item) => {
		deleteItem = item;
		render(item);
		item.onClick(() => {
			if (!confirming) {
				confirming = true;
				render(item);
				return;
			}
			void deleteProperties(app, result);
		});
	});
	// Why: moving to another item cancels the confirmation, so a later press starts over.
	menu.onSelectionChange((selected) => {
		if (!confirming || !deleteItem || selected === deleteItem) return;
		confirming = false;
		render(deleteItem);
	});
}

/** Removes the key from every note the list spans that has it; one failing note does not stop the rest. */
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
		new Notice(`Deleted ${result.key} from ${deleted} ${deleted === 1 ? "note" : "notes"}.`);
	if (failed > 0)
		new Notice(`Could not update the properties of ${failed} notes. See the console.`);
	if (deleted === 0 && failed === 0) new Notice(`No selected note has ${result.key}.`);
}

/** Removes the key from the note the list was built from. */
async function deleteProperty(app: App, result: PropertyResult): Promise<void> {
	const file: TFile | null = app.vault.getFileByPath(result.sourcePath);
	if (!file) {
		new Notice("The note for this property no longer exists.");
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
	if (updated) new Notice(`Deleted ${result.key} from ${file.basename}.`);
	else new Notice(`Could not update the properties of ${file.basename}. See the console.`);
}
