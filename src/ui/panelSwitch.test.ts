import { describe, expect, it, vi } from "vitest";
import { PanelSwitch } from "src/ui/panelSwitch";

function create(value = false) {
	const onChange = vi.fn();
	const panelSwitch = new PanelSwitch({
		id: "regex",
		label: "Regex",
		icon: "regex",
		description: "Use a regular expression",
		value,
		onChange,
	});
	return { panelSwitch, onChange };
}

describe("PanelSwitch", () => {
	it("exposes what the options menu needs", () => {
		const { panelSwitch } = create(true);
		expect(panelSwitch).toMatchObject({
			id: "regex",
			label: "Regex",
			icon: "regex",
			description: "Use a regular expression",
			value: true,
			isHidden: false,
		});
	});

	it("flips and notifies the host", () => {
		const { panelSwitch, onChange } = create();
		panelSwitch.flip();
		expect(panelSwitch.value).toBe(true);
		expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
		panelSwitch.flip();
		expect(onChange).toHaveBeenLastCalledWith(false);
	});

	it("shows a restored state without notifying", () => {
		const { panelSwitch, onChange } = create();
		panelSwitch.set(true);
		expect(panelSwitch.value).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("keeps its value while hidden", () => {
		const { panelSwitch } = create(true);
		panelSwitch.setHidden(true);
		expect(panelSwitch.isHidden).toBe(true);
		expect(panelSwitch.value).toBe(true);
	});
});
