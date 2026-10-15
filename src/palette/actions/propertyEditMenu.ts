import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";

/**
 * Adds an action that opens the Properties mode for the one selected note, so its properties
 * can be edited without opening the note first. Properties list a single note, so a
 * multi-selection and non-Markdown files get no item. `onSelected` closes a modal palette
 * before the new one opens.
 */
export function addPropertyEditMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onSelected?: () => void,
): void {
	if (results.length !== 1) return;
	const file = resolveVaultFile(plugin.app, results[0]);
	if (file?.extension !== "md") return;
	menu.addItem((item) =>
		item
			.setTitle("Edit properties…")
			.setIcon("text-cursor-input")
			.onClick(() => {
				onSelected?.();
				plugin.paletteOpener.openPalette(
					`${plugin.settings.modes.properties.alias} `,
					undefined,
					{
						modeEntries: true,
						sourceFile: file,
					},
				);
			}),
	);
}
