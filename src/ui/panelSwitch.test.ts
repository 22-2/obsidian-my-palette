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

describe("パネルスイッチ", () => {
	it("オプションメニューに必要なものを公開します", () => {
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

	it("反転してホストに通知します", () => {
		const { panelSwitch, onChange } = create();
		panelSwitch.flip();
		expect(panelSwitch.value).toBe(true);
		expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
		panelSwitch.flip();
		expect(onChange).toHaveBeenLastCalledWith(false);
	});

	it("通知せずに復元された状態を表示します", () => {
		const { panelSwitch, onChange } = create();
		panelSwitch.set(true);
		expect(panelSwitch.value).toBe(true);
		expect(onChange).not.toHaveBeenCalled();
	});

	it("隠蔽されている間も値を保持します", () => {
		const { panelSwitch } = create(true);
		panelSwitch.setHidden(true);
		expect(panelSwitch.isHidden).toBe(true);
		expect(panelSwitch.value).toBe(true);
	});
});
