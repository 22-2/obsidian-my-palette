import { TFile, type App, type Menu } from "obsidian";
import type { PaletteResult } from "src/palette/results";
import { insertTags } from "src/tags/insertTags";
import type MyPalettePlugin from "src/main";

/**
 * Resolves a palette result to an indexed Markdown note. Ignored notes are
 * skipped instead of imported: adding a tag is not a reason to move a note
 * into the vault index, unlike MOC insertion which needs a link target.
 */
function resolveTagTarget(app: App, result: PaletteResult): TFile | undefined {
	if (result.mode === "command" || result.mode === "search-history") return undefined;
	if (result.mode === "file" && result.ignored) return undefined;
	const file =
		result.mode === "file" || result.mode === "everything"
			? result.vaultPath
				? app.vault.getAbstractFileByPath(result.vaultPath)
				: null
			: result.file;
	return file instanceof TFile && file.extension === "md" ? file : undefined;
}

/** Adds one action that inserts the chosen tags into every selected note. */
export function addTagInsertionMenuItems(
	menu: Menu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
): void {
	const targets = new Map<string, TFile>();
	for (const result of results) {
		const file = resolveTagTarget(plugin.app, result);
		if (file) targets.set(file.path, file);
	}
	if (targets.size === 0) return;
	menu.addItem((item) =>
		item
			.setTitle(targets.size > 1 ? `Add tags to ${targets.size} notes…` : "Add tags…")
			.setIcon("tags")
			.onClick(() => {
				onSelected?.();
				void insertTags(plugin, [...targets.values()]);
			}),
	);
}
