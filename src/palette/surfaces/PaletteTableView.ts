import { PaletteView } from "src/palette/surfaces/PaletteView";
import { PALETTE_TABLE_VIEW_TYPE } from "src/palette/surfaces/paletteViewTypes";
import { t } from "src/i18n";

/** 検索と結果の操作は共有しつつ、表のペインは独立に指定できるままにする。 */
export class PaletteTableView extends PaletteView {
	protected override get tableView(): boolean {
		return true;
	}

	override getViewType(): typeof PALETTE_TABLE_VIEW_TYPE {
		return PALETTE_TABLE_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return t("view.tablePalette");
	}

	override getIcon(): string {
		return "table";
	}
}
