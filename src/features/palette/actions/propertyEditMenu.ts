import type MyPalettePlugin from "src/main";
import { collectVaultFiles } from "src/features/palette/actions/resultFile";
import type { PaletteResult } from "src/core/results";
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
	const files = collectVaultFiles(plugin.app, results, {
		acceptFile: (file) => file.extension === "md",
	});
	if (files.length === 0) return;
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
