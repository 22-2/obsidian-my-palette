import { PaletteView } from "src/palette/surfaces/PaletteView";
import { PALETTE_TABLE_VIEW_TYPE } from "src/palette/surfaces/paletteViewTypes";

/** Share search and result actions while keeping table panes independently addressable. */
export class PaletteTableView extends PaletteView {
	protected override get tableView(): boolean {
		return true;
	}

	override getViewType(): typeof PALETTE_TABLE_VIEW_TYPE {
		return PALETTE_TABLE_VIEW_TYPE;
	}

	override getDisplayText(): string {
		return "My Palette Table";
	}

	override getIcon(): string {
		return "table";
	}
}
