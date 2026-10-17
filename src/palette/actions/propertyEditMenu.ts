import type { TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * 選んだ Markdown ノートのプロパティモードを開く操作を加える。開かずにプロパティを編集できる。
 * ノートが1つなら、そのプロパティを一覧にする。複数なら、すべてのキーを一覧にして、
 * すべてのノートをまとめて編集する。ほかのファイルは飛ばし、ノートがない選択では項目を出さない。
 * `onSelected` は、新しいパレットを開く前にモーダルのパレットを閉じる。
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
