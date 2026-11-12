import type MyPalettePlugin from "src/main";
import { collectVaultFiles } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/core/results";
import { MergeTargetModal } from "src/merge/MergeTargetModal";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { t } from "src/i18n";

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
	const sources = collectVaultFiles(plugin.app, results, {
		acceptFile: (file) => file.extension === "md",
	});
	if (sources.length === 0) return;
	const action =
		results.length > 1
			? { ...MENU_ACTIONS.merge, title: t("menu.mergeSelected", { count: sources.length }) }
			: MENU_ACTIONS.merge;
	menu.addItem((item) =>
		withAction(item, action).onClick(() =>
			new MergeTargetModal(plugin, sources, onDone).open(),
		),
	);
}
