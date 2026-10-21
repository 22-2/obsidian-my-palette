import type { TFile } from "obsidian";
import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import { MergeTargetModal } from "src/merge/MergeTargetModal";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

/**
 * 選んだノートを、次に選ぶマージ先へ統合する操作を1つ加える。対象は Markdown ノートだけ。
 * `onDone` は統合したあとに実行する。キャンセルすると、パレットは元の場所に残る。
 */
export function addMergeMenuItem(
	menu: PaletteMenu,
	plugin: MyPalettePlugin,
	results: readonly PaletteResult[],
	onDone?: () => void,
): void {
	const sources = new Map<string, TFile>();
	for (const result of results) {
		const file = resolveVaultFile(plugin.app, result);
		if (file?.extension === "md") sources.set(file.path, file);
	}
	if (sources.size === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.merge).onClick(() =>
			new MergeTargetModal(plugin, [...sources.values()], onDone).open(),
		),
	);
}
