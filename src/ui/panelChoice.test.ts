import { describe, expect, it, vi } from "vitest";
import { PanelChoice } from "src/ui/panelChoice";

function createChoice(onChange = vi.fn()) {
	const choice = new PanelChoice<"a" | "b">({
		id: "test",
		label: "Show",
		items: [
			{ value: "a", label: "A" },
			{ value: "b", label: "B" },
		],
		value: "a",
		onChange,
	});
	return { choice, onChange };
}

describe("PanelChoice", () => {
	it("notifies only when a different item is chosen", () => {
		const { choice, onChange } = createChoice();
		choice.choose("a");
		expect(onChange).not.toHaveBeenCalled();
		choice.choose("b");
		expect(choice.value).toBe("b");
		expect(onChange).toHaveBeenCalledWith("b");
	});

	it("restores a value without notifying and keeps it while hidden", () => {
		const { choice, onChange } = createChoice();
		choice.set("b");
		choice.setHidden(true);
		expect(choice.value).toBe("b");
		expect(choice.isHidden).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});
});
