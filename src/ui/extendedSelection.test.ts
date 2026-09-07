import { describe, expect, it } from "vitest";
import { ExtendedSelection } from "src/ui/extendedSelection";

describe("ExtendedSelection", () => {
	it("replaces selection on an unmodified click", () => {
		const selection = new ExtendedSelection();
		selection.reset(5);
		selection.select(3, 5, { toggle: false, range: false });
		expect(selection.indexes()).toEqual([3]);
	});

	it("toggles items with Ctrl or Command semantics", () => {
		const selection = new ExtendedSelection();
		selection.reset(5);
		selection.select(2, 5, { toggle: true, range: false });
		selection.select(0, 5, { toggle: true, range: false });
		expect(selection.indexes()).toEqual([2]);
	});

	it("selects a range from the most recent anchor", () => {
		const selection = new ExtendedSelection();
		selection.reset(6);
		selection.select(1, 6, { toggle: false, range: false });
		selection.select(4, 6, { toggle: false, range: true });
		expect(selection.indexes()).toEqual([1, 2, 3, 4]);
	});

	it("preserves a selection when right-clicking inside it", () => {
		const selection = new ExtendedSelection();
		selection.reset(5);
		selection.select(3, 5, { toggle: true, range: false });
		selection.selectForContextMenu(3, 5);
		expect(selection.indexes()).toEqual([0, 3]);
		selection.selectForContextMenu(2, 5);
		expect(selection.indexes()).toEqual([2]);
	});
});
