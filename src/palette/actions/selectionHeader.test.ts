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
				setDisabled: (value: boolean) => (disabled.push(value), item),
			};
			configure(item);
		},
		addSeparator,
	} as unknown as PaletteMenu;
	return { instance, titles, disabled, addSeparator };
}

it("adds a disabled count row followed by a separator for several results", () => {
	const m = menu();
	addSelectionHeader(m.instance, 4);
	expect(m.titles).toEqual(["4 items selected"]);
	expect(m.disabled).toEqual([true]);
	expect(m.addSeparator).toHaveBeenCalledOnce();
});

it("adds nothing for a single result", () => {
	const m = menu();
	addSelectionHeader(m.instance, 1);
	expect(m.titles).toEqual([]);
	expect(m.addSeparator).not.toHaveBeenCalled();
});
