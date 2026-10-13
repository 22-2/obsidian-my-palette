import { Notice, type Setting } from "obsidian";
import type { SettingsHost } from "src/settings/settingsHost";
import {
	DEFAULT_HOTKEYS,
	HOTKEY_ACTIONS,
	formatHotkey,
	hotkeyError,
	hotkeyFromEvent,
	type HotkeyAction,
	type HotkeyScope,
	type PaletteHotkey,
} from "src/ui/hotkeys";

const SCOPE_NAMES: Record<HotkeyScope, string> = {
	palette: "Palette",
	"file-search": "File search",
	selector: "Selectors",
	"tag-insert-selector": "Tag insert selector",
	"moc-insert-selector": "MOC insert selector",
	"moc-remove-selector": "MOC remove selector",
};

/** The order places are listed in a When cell and, by that list, the rows of the table. */
const SCOPE_ORDER: readonly HotkeyScope[] = [
	"palette",
	"file-search",
	"selector",
	"tag-insert-selector",
	"moc-insert-selector",
	"moc-remove-selector",
];

function orderedScopes(scopes: readonly HotkeyScope[]): HotkeyScope[] {
	return SCOPE_ORDER.filter((scope) => scopes.includes(scope));
}

/** Palettes and selectors together read as one place, which comes before any narrower one. */
function coversPalettesAndSelectors(scopes: readonly HotkeyScope[]): boolean {
	return scopes.includes("palette") && scopes.includes("selector");
}

/** Names the places a shortcut works, as the When column shows them. */
export function hotkeyScopeLabel(scopes: readonly HotkeyScope[]): string {
	if (coversPalettesAndSelectors(scopes)) return "All palettes and selectors";
	return orderedScopes(scopes)
		.map((scope) => SCOPE_NAMES[scope])
		.join(", ");
}

/**
 * Sorts shortcuts by their When cell: everywhere first, then the places in
 * SCOPE_ORDER, a shorter list before a longer one that starts the same way.
 */
export function compareScopes(a: readonly HotkeyScope[], b: readonly HotkeyScope[]): number {
	const keyOf = (scopes: readonly HotkeyScope[]) =>
		coversPalettesAndSelectors(scopes)
			? [-1]
			: orderedScopes(scopes).map((scope) => SCOPE_ORDER.indexOf(scope));
	const [first, second] = [keyOf(a), keyOf(b)];
	for (let index = 0; index < Math.min(first.length, second.length); index++) {
		if (first[index] !== second[index]) return first[index] - second[index];
	}
	return first.length - second.length;
}

const HOTKEY_ACTION_LIST = (Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).sort((a, b) =>
	compareScopes(HOTKEY_ACTIONS[a].scopes, HOTKEY_ACTIONS[b].scopes),
);

interface ShortcutRow {
	row: HTMLTableRowElement;
	errorRow: HTMLTableRowElement;
	render: () => void;
}

/**
 * The Shortcuts table: one row per action, with a keybinding that is recorded by
 * clicking it. The table is drawn by hand, so its events use the elements
 * themselves and work in a popout settings window too.
 */
export function renderShortcutsTable(setting: Setting, plugin: SettingsHost): void {
	setting.settingEl.addClass("my-palette-shortcuts");
	const root = setting.controlEl.createDiv("my-palette-shortcuts__body");

	const filter = root.createEl("input", {
		cls: "my-palette-shortcuts__filter",
		attr: {
			type: "search",
			placeholder: "Filter by command, keybinding or place",
			"aria-label": "Filter shortcuts",
		},
	});
	const table = root.createEl("table", { cls: "my-palette-shortcuts__table" });
	const head = table.createEl("thead").createEl("tr");
	for (const label of ["Command", "Keybinding", "When", ""]) head.createEl("th", { text: label });
	const tbody = table.createEl("tbody");

	const rows = new Map<HotkeyAction, ShortcutRow>();
	const renderAll = () => {
		for (const entry of rows.values()) entry.render();
	};

	for (const action of HOTKEY_ACTION_LIST) {
		const definition = HOTKEY_ACTIONS[action];
		const row = tbody.createEl("tr", { cls: "my-palette-shortcuts__row" });
		const name = row.createEl("td", {
			text: definition.name,
			cls: "my-palette-shortcuts__name",
		});
		name.title = definition.description;

		const keyCell = row.createEl("td");
		const key = keyCell.createDiv({
			cls: "my-palette-shortcuts__key",
			attr: { role: "button", tabindex: "0" },
		});
		row.createEl("td", {
			text: hotkeyScopeLabel(definition.scopes),
			cls: "my-palette-shortcuts__when",
		});
		const resetCell = row.createEl("td");
		const reset = resetCell.createEl("button", {
			text: "Reset",
			cls: "my-palette-shortcuts__reset",
			attr: { type: "button", "aria-label": `Reset ${definition.name}` },
		});

		const errorRow = tbody.createEl("tr", { cls: "my-palette-shortcuts__error-row" });
		errorRow.hidden = true;
		const errorCell = errorRow.createEl("td", { attr: { colspan: "4", role: "alert" } });

		const editor = createRowEditor(action, plugin, {
			key,
			reset,
			errorRow,
			errorCell,
			renderAll,
		});
		rows.set(action, { row, errorRow, render: editor.render });

		key.addEventListener("click", editor.startRecording);
		key.addEventListener("keydown", (event) => {
			// Enter and Space open the recorder like a click; they are not recorded themselves.
			if (!editor.isRecording() && (event.key === "Enter" || event.key === " ")) {
				event.preventDefault();
				editor.startRecording();
				return;
			}
			editor.handleKey(event);
		});
		key.addEventListener("blur", editor.cancelRecording);
		reset.addEventListener(
			"click",
			() => void editor.save(structuredClone(DEFAULT_HOTKEYS[action])),
		);
	}

	filter.addEventListener("input", () => {
		const query = filter.value.trim().toLocaleLowerCase();
		for (const [action, entry] of rows) {
			const visible = matchesQuery(action, query, plugin);
			entry.row.toggleAttribute("hidden", !visible);
			// Why: an error belongs to its row, so it hides with the row.
			entry.errorRow.toggleAttribute("hidden", !visible || !entry.errorRow.textContent);
		}
	});
	renderAll();
}

function matchesQuery(action: HotkeyAction, query: string, plugin: SettingsHost): boolean {
	if (!query) return true;
	const definition = HOTKEY_ACTIONS[action];
	const text = [
		definition.name,
		formatHotkey(plugin.settings.hotkeys[action]),
		hotkeyScopeLabel(definition.scopes),
	]
		.join(" ")
		.toLocaleLowerCase();
	return query.split(/\s+/).every((term) => text.includes(term));
}

interface RowParts {
	key: HTMLElement;
	reset: HTMLButtonElement;
	errorRow: HTMLTableRowElement;
	errorCell: HTMLTableCellElement;
	renderAll: () => void;
}

function createRowEditor(action: HotkeyAction, plugin: SettingsHost, parts: RowParts) {
	const definition = HOTKEY_ACTIONS[action];
	let recording = false;
	let saving = false;

	const showError = (message: string | undefined) => {
		parts.errorCell.textContent = message ?? "";
		parts.errorRow.toggleAttribute("hidden", message === undefined);
	};

	const render = () => {
		const hotkey = plugin.settings.hotkeys[action];
		const label = recording ? "Press a shortcut…" : hotkey ? formatHotkey(hotkey) : "Disabled";
		parts.key.textContent = label;
		parts.key.toggleClass("is-recording", recording);
		parts.key.toggleClass("is-disabled", !recording && !hotkey);
		parts.key.setAttribute("aria-label", `${definition.name} keybinding: ${label}`);
		parts.key.title = definition.description;
		// Only a changed binding offers Reset.
		parts.reset.toggleAttribute("hidden", sameHotkey(hotkey, DEFAULT_HOTKEYS[action]));
	};

	const save = async (hotkey: PaletteHotkey | null) => {
		if (saving) return;
		const error = hotkeyError(action, hotkey, plugin.settings.hotkeys);
		if (error) {
			showError(error);
			return;
		}
		saving = true;
		const previous = plugin.settings.hotkeys[action];
		plugin.settings.hotkeys[action] = hotkey;
		try {
			await plugin.saveSettings();
			recording = false;
			showError(undefined);
		} catch (saveError) {
			plugin.settings.hotkeys[action] = previous;
			new Notice(
				`Could not save hotkey: ${saveError instanceof Error ? saveError.message : String(saveError)}`,
			);
		} finally {
			saving = false;
			// Another row may now clash with this one, so every row is redrawn.
			parts.renderAll();
		}
	};

	const cancelRecording = () => {
		if (!recording) return;
		recording = false;
		showError(undefined);
		render();
	};

	const startRecording = () => {
		if (saving) return;
		recording = true;
		showError(undefined);
		render();
		parts.key.focus();
	};

	const handleKey = (event: KeyboardEvent) => {
		if (!recording || event.isComposing) return;
		// Tab keeps its focus behavior, and cancels a recording the way Escape does.
		if (event.key === "Tab") {
			cancelRecording();
			return;
		}
		event.preventDefault();
		event.stopPropagation();
		if (event.key === "Escape") {
			cancelRecording();
			return;
		}
		if (event.key === "Backspace" || event.key === "Delete") {
			void save(null);
			return;
		}
		if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return;
		const hotkey = hotkeyFromEvent(event);
		if (!hotkey) {
			showError("Choose a letter, number, function key or key combination.");
			return;
		}
		void save(hotkey);
	};

	return {
		isRecording: () => recording,
		render,
		save,
		startRecording,
		cancelRecording,
		handleKey,
	};
}

function sameHotkey(a: PaletteHotkey | null, b: PaletteHotkey | null): boolean {
	if (!a || !b) return a === b;
	return a.key === b.key && a.modifiers.join("+") === b.modifiers.join("+");
}
