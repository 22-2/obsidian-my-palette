import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { readList } from "src/properties/propertyList";

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
	menu.addItem((item) => item.setTitle("Edit").setIcon("pencil").onClick(edit));
	menu.addItem((item) =>
		item
			.setTitle("Open in search")
			.setIcon("search")
			.onClick(() => openPropertySearch(plugin.app, result.key, beforeSearch)),
	);
	if (result.inNote) {
		menu.addItem((item) =>
			item
				.setTitle("Copy value")
				.setIcon("clipboard-copy")
				.onClick(() => void copyValue(plugin.app, result)),
		);
		menu.addItem((item) =>
			item
				.setTitle("Delete property")
				.setIcon("trash-2")
				.onClick(() => void deleteProperty(plugin.app, result)),
		);
	}
	menu.addItem((item) =>
		item
			.setTitle("Copy property name")
			.setIcon("clipboard-copy")
			.onClick(() => void copyText(result.key, "Property name copied.")),
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
	} catch {
		new Notice("Could not copy to the clipboard.");
	}
}

/** Removes the key from the note the list was built from. */
async function deleteProperty(app: App, result: PropertyResult): Promise<void> {
	const file: TFile | null = app.vault.getFileByPath(result.sourcePath);
	if (!file) {
		new Notice("The note for this property no longer exists.");
		return;
	}
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			delete frontmatter[result.key];
		});
		new Notice(`Deleted ${result.key} from ${file.basename}.`);
	} catch (error) {
		console.error(`Failed to delete the property ${result.key} of ${file.path}`, error);
		new Notice(`Could not update the properties of ${file.basename}. See the console.`);
	}
}
