import { Notice, type App, type TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import type { PropertyResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";

/** Whether the palette should close once the edit has started. */
export type PropertyEditOutcome = "close" | "stay";

/**
 * Starts the editor for a property row. Tags opens Tag insertion, which only
 * writes the `tags` key; a checkbox flips in place so the list can show the change.
 */
export async function editPropertyResult(
	plugin: MyPalettePlugin,
	result: PropertyResult,
): Promise<PropertyEditOutcome> {
	const file = plugin.app.vault.getFileByPath(result.sourcePath);
	if (!file) {
		new Notice("The note for this property no longer exists.");
		return "stay";
	}
	switch (result.kind) {
		case "tags":
			await insertTags(plugin, [file]);
			return "close";
		case "checkbox":
			await toggleCheckbox(plugin.app, file, result.key);
			return "stay";
		case "unsupported":
			new Notice("Edit this property in source mode.");
			return "stay";
		default:
			return "stay";
	}
}

/** Sets a checkbox to true unless it is already true, so a missing key is added as true. */
async function toggleCheckbox(app: App, file: TFile, key: string): Promise<void> {
	const current: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.[key];
	const next = current !== true;
	try {
		await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			frontmatter[key] = next;
		});
	} catch (error) {
		console.error(`Failed to update the property ${key} of ${file.path}`, error);
		new Notice(`Could not update the properties of ${file.basename}. See the console.`);
		return;
	}
	new Notice(`Set ${key} to ${next} on ${file.basename}.`);
}
