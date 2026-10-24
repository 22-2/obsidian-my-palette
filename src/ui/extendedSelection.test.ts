import { describe, expect, it } from "vitest";
import { ExtendedSelection } from "src/ui/extendedSelection";

describe("拡張選択", () => {
	it("変更されていないクリックで選択範囲を置き換えます", () => {
		const selection = new ExtendedSelection();
		selection.reset(5);
		selection.select(3, 5, { toggle: false, range: false });
		expect(selection.indexes()).toEqual([3]);
	});

	it("Ctrl または Command セマンティクスで項目を切り替えます", () => {
		const selection = new ExtendedSelection();
		selection.reset(5);
		selection.select(2, 5, { toggle: true, range: false });
		selection.select(0, 5, { toggle: true, range: false });
		expect(selection.indexes()).toEqual([2]);
	});

	it("最新のアンカーから範囲を選択します", () => {
		const selection = new ExtendedSelection();
		selection.reset(6);
		selection.select(1, 6, { toggle: false, range: false });
		selection.select(4, 6, { toggle: false, range: true });
		expect(selection.indexes()).toEqual([1, 2, 3, 4]);
	});

	it("選択範囲内を右クリックすると選択範囲が保持されます", () => {
		const selection = new ExtendedSelection();
		selection.reset(5);
		selection.select(3, 5, { toggle: true, range: false });
		selection.selectForContextMenu(3, 5);
		expect(selection.indexes()).toEqual([0, 3]);
		selection.selectForContextMenu(2, 5);
		expect(selection.indexes()).toEqual([2]);
	});
});
