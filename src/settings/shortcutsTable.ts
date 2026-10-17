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
	worksIn,
} from "src/ui/hotkeys";

const SCOPE_NAMES: Record<HotkeyScope, string> = {
	palette: "Palette",
	selector: "Selectors",
	"tag-insert-selector": "Tag insert selector",
	"moc-insert-selector": "MOC insert selector",
	"moc-remove-selector": "MOC remove selector",
	"property-value-selector": "Property value selector",
};

/** The order places are listed in a When cell and, by that list, the rows of the table. */
const SCOPE_ORDER: readonly HotkeyScope[] = [
	"palette",
	"selector",
	"tag-insert-selector",
	"moc-insert-selector",
	"moc-remove-selector",
	"property-value-selector",
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

/**
 * Short names for the place chips in a group heading. The heading's tooltip and accessible
 * name list the full names, so the chips stay short as more places are added.
 */
const SCOPE_SHORT_NAMES: Record<HotkeyScope, string> = {
	palette: "Palette",
	selector: "Selectors",
	"tag-insert-selector": "Tag",
	"moc-insert-selector": "MOC +",
	"moc-remove-selector": "MOC −",
	"property-value-selector": "Property",
};

/** Places offered by the place filter. "selector" is the group of every selector, not one place. */
const FILTER_PLACES = SCOPE_ORDER.filter((scope) => scope !== "selector");

const TABLE_COLUMNS = 3;

const HOTKEY_ACTION_LIST = (Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).sort((a, b) =>
	compareScopes(HOTKEY_ACTIONS[a].scopes, HOTKEY_ACTIONS[b].scopes),
);

/** Shortcuts used in the same places share a group, so each one is listed once. */
function scopeGroupKey(scopes: readonly HotkeyScope[]): string {
	return coversPalettesAndSelectors(scopes) ? "*" : orderedScopes(scopes).join(" ");
}

interface ShortcutGroup {
	body: HTMLTableSectionElement;
	chips: HTMLElement[];
	actions: HotkeyAction[];
}

/** A group's own tbody, headed by chips for the places its shortcuts work in. */
function createGroup(table: HTMLTableElement, scopes: readonly HotkeyScope[]): ShortcutGroup {
	const body = table.createEl("tbody", { cls: "my-palette-shortcuts__group" });
	const heading = body.createEl("tr").createEl("th", {
		cls: "my-palette-shortcuts__group-heading",
		attr: {
			colspan: String(TABLE_COLUMNS),
			scope: "rowgroup",
			"aria-label": hotkeyScopeLabel(scopes),
		},
	});
	const places = heading.createDiv("my-palette-shortcuts__places");
	if (coversPalettesAndSelectors(scopes)) {
		places.createSpan({
			text: hotkeyScopeLabel(scopes),
			cls: "my-palette-shortcuts__place is-everywhere",
		});
		return { body, chips: [], actions: [] };
	}
	const chips = orderedScopes(scopes).map((scope) =>
		places.createSpan({
			text: SCOPE_SHORT_NAMES[scope],
			cls: "my-palette-shortcuts__place",
			attr: { "data-scope": scope },
		}),
	);
	return { body, chips, actions: [] };
}

interface ShortcutRow {
	row: HTMLTableRowElement;
	errorRow: HTMLTableRowElement;
	render: () => void;
}

/**
 * The Shortcuts table: one row per action, with a keybinding that is recorded by
 * clicking it. Rows are grouped by the places they work in, so a new place adds a chip
 * to a heading instead of a column. The table is drawn by hand, so its events use the
 * elements themselves and work in a popout settings window too.
 */
export function renderShortcutsTable(setting: Setting, plugin: SettingsHost): void {
	setting.settingEl.addClass("my-palette-shortcuts");
	const root = setting.controlEl.createDiv("my-palette-shortcuts__body");

	const controls = root.createDiv("my-palette-shortcuts__controls");
	const filter = controls.createEl("input", {
		cls: "my-palette-shortcuts__filter",
		attr: {
			type: "search",
			placeholder: "Filter by command, keybinding or place",
			"aria-label": "Filter shortcuts",
		},
	});
	const placeFilter = controls.createEl("select", {
		cls: "dropdown my-palette-shortcuts__place-filter",
		attr: { "aria-label": "Filter by place" },
	});
	placeFilter.createEl("option", { text: "All places", attr: { value: "" } });
	for (const scope of FILTER_PLACES)
		placeFilter.createEl("option", { text: SCOPE_NAMES[scope], attr: { value: scope } });

	const scroller = root.createDiv("my-palette-shortcuts__scroller");
	const table = scroller.createEl("table", { cls: "my-palette-shortcuts__table" });
	const columns = table.createEl("colgroup");
	columns.createEl("col");
	columns.createEl("col", { cls: "my-palette-shortcuts__key-column" });
	columns.createEl("col", { cls: "my-palette-shortcuts__reset-column" });
	const head = table.createEl("thead").createEl("tr");
	for (const label of ["Command", "Keybinding"]) head.createEl("th", { text: label });
	head.createEl("th", { attr: { "aria-label": "Reset" } });

	const rows = new Map<HotkeyAction, ShortcutRow>();
	const groups = new Map<string, ShortcutGroup>();
	const renderAll = () => {
		for (const entry of rows.values()) entry.render();
	};

	for (const action of HOTKEY_ACTION_LIST) {
		const definition = HOTKEY_ACTIONS[action];
		// The list is sorted by place, so each group's rows come together.
		const groupKey = scopeGroupKey(definition.scopes);
		let group = groups.get(groupKey);
		if (!group) {
			group = createGroup(table, definition.scopes);
			groups.set(groupKey, group);
		}
		group.actions.push(action);
		const tbody = group.body;
		const row = tbody.createEl("tr", { cls: "my-palette-shortcuts__row" });
		const nameId = `my-palette-shortcut-${action}-name`;
		const keyId = `my-palette-shortcut-${action}-key`;
		const name = row.createEl("td", {
			text: definition.name,
			cls: "my-palette-shortcuts__name",
			attr: { id: nameId },
		});
		name.title = definition.description;

		const keyCell = row.createEl("td");
		const key = keyCell.createDiv({
			cls: "my-palette-shortcuts__key",
			// Named by its row and its own text, so only the description's tooltip shows.
			attr: {
				id: keyId,
				role: "button",
				tabindex: "0",
				"aria-labelledby": `${nameId} ${keyId}`,
			},
		});
		const resetCell = row.createEl("td");
		const reset = resetCell.createEl("button", {
			text: "Reset",
			cls: "my-palette-shortcuts__reset",
			attr: { type: "button", "aria-label": `Reset ${definition.name}` },
		});

		const errorRow = tbody.createEl("tr", { cls: "my-palette-shortcuts__error-row" });
		errorRow.hidden = true;
		const errorCell = errorRow.createEl("td", {
			attr: { colspan: String(TABLE_COLUMNS), role: "alert" },
		});

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

	const applyFilters = () => {
		const query = filter.value.trim().toLocaleLowerCase();
		const place = (placeFilter.value || undefined) as HotkeyScope | undefined;
		for (const [action, entry] of rows) {
			const visible =
				matchesQuery(action, query, plugin) &&
				(!place || worksIn(HOTKEY_ACTIONS[action].scopes, place));
			entry.row.toggleAttribute("hidden", !visible);
			// Why: an error belongs to its row, so it hides with the row.
			entry.errorRow.toggleAttribute("hidden", !visible || !entry.errorRow.textContent);
		}
		// A group with no rows left hides its heading too; the chosen place is marked in the rest.
		for (const group of groups.values()) {
			const empty = group.actions.every((action) => rows.get(action)?.row.hidden);
			group.body.toggleAttribute("hidden", empty);
			for (const chip of group.chips)
				chip.toggleClass("is-match", chip.dataset.scope === place);
		}
	};
	filter.addEventListener("input", applyFilters);
	placeFilter.addEventListener("change", applyFilters);
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
