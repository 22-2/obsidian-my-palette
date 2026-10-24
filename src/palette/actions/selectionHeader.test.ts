import { expect, it, vi } from "vitest";
import { addSelectionHeader } from "src/palette/actions/selectionHeader";
import type { PaletteMenu } from "src/ui/paletteMenu";

function menu() {
	const titles: string[] = [];
	const disabled: boolean[] = [];
	const addSeparator = vi.fn();
	const instance = {
		addItem: (configure: (item: unknown) => void) => {
			const item = {
				setTitle: (title: string) => (titles.push(title), item),
				setIcon: () => item,
				setSearchTerms: () => item,
				setDisabled: (value: boolean) => (disabled.push(value), item),
			};
			configure(item);
		},
		addSeparator,
	} as unknown as PaletteMenu;
	return { instance, titles, disabled, addSeparator };
}

it("無効なカウント行の後に複数の結果の区切り文字を追加します", () => {
	const m = menu();
	addSelectionHeader(m.instance, 4);
	expect(m.titles).toEqual(["4 件を選択中"]);
	expect(m.disabled).toEqual([true]);
	expect(m.addSeparator).toHaveBeenCalledOnce();
});

it("単一の結果に対しては何も追加されません", () => {
	const m = menu();
	addSelectionHeader(m.instance, 1);
	expect(m.titles).toEqual([]);
	expect(m.addSeparator).not.toHaveBeenCalled();
});
