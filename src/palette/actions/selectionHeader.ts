import type { PaletteMenu } from "src/ui/paletteMenu";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/**
 * 操作の対象の件数を示す、無効な最初の行を加える。そうすると、各操作の名前には件数を入れずに済む。
 * 単一の結果には見出しは要らない。
 */
export function addSelectionHeader(menu: PaletteMenu, count: number): void {
	if (count < 2) return;
	menu.addItem((item) =>
		item.setTitle(t("selection.header", { count })).setIcon(ICONS.selection).setDisabled(true),
	);
	menu.addSeparator();
}
