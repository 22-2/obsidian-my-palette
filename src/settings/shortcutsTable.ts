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
import { t } from "src/i18n";

const SCOPE_NAMES: Record<HotkeyScope, string> = {
	palette: t("hotkey.scope.palette"),
	selector: t("hotkey.scope.selector"),
	"tag-insert-selector": t("hotkey.scope.tagInsert"),
	"moc-insert-selector": t("hotkey.scope.mocInsert"),
	"moc-remove-selector": t("hotkey.scope.mocRemove"),
	"property-value-selector": t("hotkey.scope.propertyValue"),
};

/** 「場所」の欄に並ぶ順。その並びが、表の行の順にもなる。 */
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

/** パレットとセレクターの両方は、ひとつの場所として読める。より狭い場所より先に置く。 */
function coversPalettesAndSelectors(scopes: readonly HotkeyScope[]): boolean {
	return scopes.includes("palette") && scopes.includes("selector");
}

/** 「場所」の欄に出る、ショートカットが使える場所の名前。 */
export function hotkeyScopeLabel(scopes: readonly HotkeyScope[]): string {
	if (coversPalettesAndSelectors(scopes)) return t("hotkey.scope.everywhere");
	return orderedScopes(scopes)
		.map((scope) => SCOPE_NAMES[scope])
		.join(", ");
}

/**
 * ショートカットを「場所」の欄で並べる。どこでも使えるものが先、次に SCOPE_ORDER の順の場所。
 * 同じ書き出しなら、短いリストが先。
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
 * グループの見出しにあるチップの短い名前。見出しのツールチップとアクセシブルな名前は正式名を並べるので、
 * 場所が増えてもチップは短いままになる。
 */
const SCOPE_SHORT_NAMES: Record<HotkeyScope, string> = {
	palette: t("hotkey.short.palette"),
	selector: t("hotkey.short.selector"),
	"tag-insert-selector": t("hotkey.short.tag"),
	"moc-insert-selector": t("hotkey.short.moc"),
	"moc-remove-selector": t("hotkey.short.mocRemove"),
	"property-value-selector": t("hotkey.short.property"),
};

/** 場所の絞り込みが出す場所。「selector」は1つの場所ではなく、すべてのセレクターのグループ。 */
const FILTER_PLACES = SCOPE_ORDER.filter((scope) => scope !== "selector");

const TABLE_COLUMNS = 3;

const HOTKEY_ACTION_LIST = (Object.keys(HOTKEY_ACTIONS) as HotkeyAction[]).sort((a, b) =>
	compareScopes(HOTKEY_ACTIONS[a].scopes, HOTKEY_ACTIONS[b].scopes),
);

/** 同じ場所で使うショートカットは1つのグループにまとめ、それぞれを1回だけ並べる。 */
function scopeGroupKey(scopes: readonly HotkeyScope[]): string {
	return coversPalettesAndSelectors(scopes) ? "*" : orderedScopes(scopes).join(" ");
}

interface ShortcutGroup {
	body: HTMLTableSectionElement;
	chips: HTMLElement[];
	actions: HotkeyAction[];
}

/** グループ自身の tbody。その操作が使える場所のチップを見出しに付ける。 */
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
 * ショートカットの表: 操作ごとに1行。キー割り当てをクリックして記録する。行は動作する場所でグループ化するので、
 * 新しい場所は列ではなく見出しのチップとして増える。表は手で描くので、そのイベントは要素自体を使い、
 * ポップアウトの設定ウィンドウでも動く。
 */
export function renderShortcutsTable(setting: Setting, plugin: SettingsHost): void {
	setting.settingEl.addClass("my-palette-shortcuts");
	const root = setting.controlEl.createDiv("my-palette-shortcuts__body");

	const controls = root.createDiv("my-palette-shortcuts__controls");
	const filter = controls.createEl("input", {
		cls: "my-palette-shortcuts__filter",
		attr: {
			type: "search",
			placeholder: t("hotkey.table.filterPlaceholder"),
			"aria-label": t("hotkey.table.filterLabel"),
		},
	});
	const placeFilter = controls.createEl("select", {
		cls: "dropdown my-palette-shortcuts__place-filter",
		attr: { "aria-label": t("hotkey.table.placeLabel") },
	});
	placeFilter.createEl("option", { text: t("hotkey.table.allPlaces"), attr: { value: "" } });
	for (const scope of FILTER_PLACES)
		placeFilter.createEl("option", { text: SCOPE_NAMES[scope], attr: { value: scope } });

	const scroller = root.createDiv("my-palette-shortcuts__scroller");
	const table = scroller.createEl("table", { cls: "my-palette-shortcuts__table" });
	const columns = table.createEl("colgroup");
	columns.createEl("col");
	columns.createEl("col", { cls: "my-palette-shortcuts__key-column" });
	columns.createEl("col", { cls: "my-palette-shortcuts__reset-column" });
	const head = table.createEl("thead").createEl("tr");
	for (const label of [t("hotkey.table.command"), t("hotkey.table.keybinding")])
		head.createEl("th", { text: label });
	head.createEl("th", { attr: { "aria-label": t("hotkey.table.reset") } });

	const rows = new Map<HotkeyAction, ShortcutRow>();
	const groups = new Map<string, ShortcutGroup>();
	const renderAll = () => {
		for (const entry of rows.values()) entry.render();
	};

	for (const action of HOTKEY_ACTION_LIST) {
		const definition = HOTKEY_ACTIONS[action];
		// 一覧は場所で並んでいるので、各グループの行はまとまって現れる。
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
			// 行とそれ自身のテキストで名付けるので、説明のツールチップだけが出る。
			attr: {
				id: keyId,
				role: "button",
				tabindex: "0",
				"aria-labelledby": `${nameId} ${keyId}`,
			},
		});
		const resetCell = row.createEl("td");
		const reset = resetCell.createEl("button", {
			text: t("hotkey.table.reset"),
			cls: "my-palette-shortcuts__reset",
			attr: {
				type: "button",
				"aria-label": t("hotkey.table.resetLabel", { name: definition.name }),
			},
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
			// Enter と Space は、クリックと同じく記録を開始する。それ自体は記録されない。
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
			// Why: エラーは自分の行に属するので、行と一緒に隠れる。
			entry.errorRow.toggleAttribute("hidden", !visible || !entry.errorRow.textContent);
		}
		// 残る行がないグループは、見出しも隠す。選んだ場所は残りのチップで示す。
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
		const label = recording
			? t("hotkey.table.recording")
			: hotkey
				? formatHotkey(hotkey)
				: t("hotkey.disabled");
		parts.key.textContent = label;
		parts.key.toggleClass("is-recording", recording);
		parts.key.toggleClass("is-disabled", !recording && !hotkey);
		parts.key.title = definition.description;
		// 変更された割り当てだけが「リセット」を出す。
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
				t("hotkey.table.saveFailed", {
					message: saveError instanceof Error ? saveError.message : String(saveError),
				}),
			);
		} finally {
			saving = false;
			// ほかの行がこの行と衝突するかもしれないので、すべての行を描き直す。
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
		// Tab はフォーカスの挙動を保ち、記録をキャンセルする。Escape と同じように。
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
			showError(t("hotkey.table.chooseKey"));
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
