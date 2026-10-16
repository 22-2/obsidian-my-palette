import type { TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * Adds an action that opens the Properties mode for the selected Markdown notes, so their
 * properties can be edited without opening them first. One note lists its own properties;
 * several list the keys of all of them and edit every note together. Other files are skipped,
 * and a selection with no note gets no item. `onSelected` closes a modal palette before the
 * new one opens.
 */
export function addPropertyEditMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
): void {
	const notes = new Map<string, TFile>();
	for (const result of results) {
		const file = resolveVaultFile(plugin.app, result);
		if (file?.extension === "md") notes.set(file.path, file);
	}
	if (notes.size === 0) return;
	const files = [...notes.values()];
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.editProperties).onClick(() => {
			onSelected?.();
			plugin.paletteOpener.openPalette(
				`${plugin.settings.modes.properties.alias} `,
				undefined,
				files.length === 1
					? { modeEntries: true, sourceFile: files[0] }
					: { modeEntries: true, sourceFiles: files },
			);
		}),
	);
}
