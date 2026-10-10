import { Notice, type Setting } from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import {
	DEFAULT_HOTKEYS,
	HOTKEY_ACTIONS,
	formatHotkey,
	hotkeyError,
	hotkeyFromEvent,
	type HotkeyAction,
	type PaletteHotkey,
} from "src/ui/hotkeys";

/** Record directly in the setting row, without installing window-wide listeners. */
export function renderHotkeyControl(
	setting: Setting,
	plugin: SettingsHost,
	action: HotkeyAction,
): void {
	setting.settingEl.addClass("my-palette-hotkey-setting");
	const description = HOTKEY_ACTIONS[action].description;
	let recording = false;
	let saving = false;
	let input: HTMLInputElement;
	const refresh = () => {
		recording = false;
		input.value = plugin.settings.hotkeys[action]
			? formatHotkey(plugin.settings.hotkeys[action])
			: "";
		setting.setDesc(description);
	};
	const save = async (hotkey: PaletteHotkey | null) => {
		if (saving) return;
		const error = hotkeyError(action, hotkey, plugin.settings.hotkeys);
		if (error) {
			setting.setDesc(error);
			return;
		}
		saving = true;
		const previous = plugin.settings.hotkeys[action];
		plugin.settings.hotkeys[action] = hotkey;
		try {
			await plugin.saveSettings();
			refresh();
		} catch (error) {
			plugin.settings.hotkeys[action] = previous;
			refresh();
			new Notice(
				`Could not save hotkey: ${error instanceof Error ? error.message : String(error)}`,
			);
		} finally {
			saving = false;
		}
	};
	setting.descEl.setAttribute("aria-live", "polite");
	setting.addText((text) => {
		text.setPlaceholder("Disabled");
		input = text.inputEl;
		input.readOnly = true;
		input.setAttribute("aria-label", `${HOTKEY_ACTIONS[action].name} hotkey`);
		input.addEventListener("keydown", (event) => {
			if (event.isComposing) return;
			if (event.key === "Backspace" || event.key === "Delete") {
				event.preventDefault();
				event.stopImmediatePropagation();
				void save(null);
				return;
			}
			if (!recording) return;
			if (event.key === "Tab") {
				refresh();
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			if (event.key === "Escape") {
				refresh();
				return;
			}
			if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
			const hotkey = hotkeyFromEvent(event);
			if (!hotkey) {
				setting.setDesc(
					"Choose a letter, number, function key or key combination. Enter, Escape, Tab and navigation keys keep their standard behavior.",
				);
				return;
			}
			void save(hotkey);
		});
		input.addEventListener("blur", () => {
			if (recording && !saving) refresh();
		});
	});
	setting.addButton((button) => {
		button.setButtonText("Change").onClick(() => {
			if (saving) return;
			recording = true;
			input.value = "Press a shortcut…";
			setting.setDesc("Press your shortcut. Escape cancels; changes apply immediately.");
			input.focus();
		});
	});
	setting.addButton((button) =>
		button
			.setButtonText("Reset")
			.onClick(() => void save(structuredClone(DEFAULT_HOTKEYS[action]))),
	);
	refresh();
}
