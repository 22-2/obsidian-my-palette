import { Menu, setIcon, type App } from "obsidian";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";

/** One selectable row. `value` is what the modal resolves with when the row is checked. */
export interface MultiSelectCandidate<V> {
	/** Stable identity; checks are kept by key because the list is refiltered per query. */
	key: string;
	value: V;
	/** Row content; the check icon is supplied by the modal. */
	item: SelectionItem;
	/**
	 * Nothing is left to do for this row (a tag every target already has, a note
	 * already linked in both directions). It stays listed after the actionable
	 * rows, marked by the lock icon, and cannot be checked.
	 */
	locked?: boolean;
	/** Icon of an unchecked row; defaults to an empty box. */
	uncheckedIcon?: string;
	/**
	 * Undoes what the row would apply, offered in its context menu for rows that
	 * are already applied, fully (locked) or partly. The host updates its own
	 * data in `run`; the list is refreshed afterwards.
	 */
	removal?: { label: string; run: () => void | Promise<void> };
}

export interface MultiSelectModalProps {
	placeholder: string;
	/** Footer text naming what changes; the key hints are appended. */
	footerLabel: string;
	/** Verb of the run action and of the Ctrl+Enter hint, such as "Add". */
	actionLabel: string;
}

/**
 * Multi selector shared by tag and MOC insertion so both behave and look alike.
 * Flow: select rows (click, Ctrl, Shift, arrows) → check them (Enter, double
 * click, the check box or the context menu) → run (Ctrl+Enter or the menu of the
 * checked-list button). Checking keeps the modal open; any other close cancels.
 */
export abstract class MultiSelectModal<V> extends BaseSuggestModal<MultiSelectCandidate<V>> {
	private readonly checked = new Map<string, MultiSelectCandidate<V>>();
	private confirmedValues?: V[];
	private resolveResult?: (values: V[] | null) => void;
	private activeMenu?: Menu;
	private checkedButtonEl?: HTMLElement;
	private checkedCountEl?: HTMLElement;

	constructor(
		private readonly multiSelect: MultiSelectModalProps,
		app: App,
	) {
		super(
			{
				placeholder: multiSelect.placeholder,
				footerText: `${multiSelect.footerLabel} · Enter: check · Ctrl+Enter: ${multiSelect.actionLabel.toLowerCase()} · Esc: cancel`,
				// Same Explorer-style selection as the palette: pick rows with click,
				// Ctrl and Shift, check them, then run the action.
				selectionMode: "extended",
			},
			app,
		);
	}

	/** Candidates for the input, best match first. */
	protected abstract searchCandidates(
		query: string,
	): MultiSelectCandidate<V>[] | Promise<MultiSelectCandidate<V>[]>;

	/** Text highlighted in rows; hosts strip syntax the user types around the match. */
	protected matchQuery(query: string): string {
		return query;
	}

	/** Lets hosts add their own items, such as open and copy actions, for the selected rows. */
	protected populateSelectionMenu(
		_menu: Menu,
		_selected: readonly MultiSelectCandidate<V>[],
		_close: () => void,
	): void {}

	/** Checked rows, for hosts that rebuild the list and must keep them listed. */
	protected checkedCandidates(): MultiSelectCandidate<V>[] {
		return [...this.checked.values()];
	}

	/** Opens the modal and resolves with the checked values, or null when cancelled. */
	openAndWait(): Promise<V[] | null> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	async getSuggestions(query: string): Promise<MultiSelectCandidate<V>[]> {
		this.updateMatchQuery(this.matchQuery(query));
		const found = await this.searchCandidates(query);
		// A stable partition keeps the host's ranking inside each group.
		const candidates = [
			...found.filter(({ locked }) => !locked),
			...found.filter(({ locked }) => locked),
		];
		this.updateResultCount(candidates.length);
		return candidates;
	}

	renderSuggestion(candidate: MultiSelectCandidate<V>, el: HTMLElement): void {
		const checked = this.checked.has(candidate.key);
		renderSelectionItem(this.toSelectionItem(candidate), el, this.query);
		// Rows may be redrawn in place, so classes are set both ways.
		el.classList.toggle("is-locked", Boolean(candidate.locked));
		el.classList.toggle("is-checked", checked);
		el.setAttribute("aria-checked", String(checked));
		// The check icon toggles its row on a single press; extended selection
		// otherwise needs a double-click or Enter to change a check.
		if (!candidate.locked)
			el.querySelector(".my-palette-suggestion__icon")?.setAttribute("data-row-toggle", "");
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override onSuggestionContextMenu(
		candidate: MultiSelectCandidate<V>,
		event: MouseEvent,
	): void {
		// The panel has already moved the selection to the clicked row unless the row was
		// inside it, so the menu acts on the selected rows like the palette's own menu.
		const selected = this.getSelectedItems();
		const targets = selected.length > 0 ? selected : [candidate];
		const menu = this.replaceActiveMenu(new Menu());
		this.populateSelectionMenu(menu, targets, () => this.close());
		this.addCheckMenuItems(menu, targets);
		this.addRemovalMenuItem(menu, targets);
		menu.setParentElement(this.modalEl);
		menu.showAtMouseEvent(event);
	}

	protected override handlesSuggestionRowToggle(): boolean {
		return true;
	}

	/** Pressing a row's check icon toggles just that row without running anything. */
	protected override onSuggestionRowToggle(candidate: MultiSelectCandidate<V>): void {
		this.toggleChecks([candidate]);
	}

	// Why: the panel stops mousedown propagation on rows, so Obsidian cannot dismiss
	// an open menu itself when the user clicks a row.
	protected override onResultFocus(): void {
		this.activeMenu?.close();
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-multi-select");
		this.createCheckedButton();
	}

	protected override onSelectionModalClose(): void {
		this.activeMenu?.close();
		this.resolveResult?.(this.confirmedValues ?? null);
		this.resolveResult = undefined;
	}

	protected override async onItemActivated(
		candidate: MultiSelectCandidate<V>,
		event: Event,
	): Promise<void> {
		// Ctrl+Enter runs from any row, so the user need not leave the list.
		const runShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (runShortcut) {
			this.confirm();
			return;
		}
		// Enter checks every selected row at once; the activated row is included even
		// if a rerender left it out of the selection.
		const rows = [...this.getSelectedItems()];
		if (!rows.some(({ key }) => key === candidate.key)) rows.push(candidate);
		this.toggleChecks(rows);
	}

	/** Resolves with the given rows, or with every checked row by default. */
	private confirm(rows: readonly MultiSelectCandidate<V>[] = [...this.checked.values()]): void {
		if (rows.length === 0) return;
		this.confirmedValues = rows.map(({ value }) => value);
		this.close();
	}

	/** Unchecks when every given row is checked, otherwise checks the unchecked ones. */
	private toggleChecks(candidates: readonly MultiSelectCandidate<V>[]): void {
		const toggleable = candidates.filter(({ locked }) => !locked);
		if (toggleable.length === 0) return;
		const allChecked = toggleable.every(({ key }) => this.checked.has(key));
		for (const candidate of toggleable) {
			if (allChecked) this.checked.delete(candidate.key);
			else this.checked.set(candidate.key, candidate);
		}
		// Checks only change row icons, so rows are redrawn in place: the cursor and
		// selection stay put and an asynchronous source is not searched again.
		this.updateCheckedButton();
		this.rerenderVisibleSuggestions();
		// Keep the query but select it, so typing the next entry replaces it directly.
		this.inputEl.select();
	}

	private refreshKeepingSelection(): void {
		this.updateCheckedButton();
		this.refreshSuggestionsKeepingSelection((a, b) => a.key === b.key);
	}

	private replaceActiveMenu(menu: Menu): Menu {
		this.activeMenu?.close();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		return menu;
	}

	private addCheckMenuItems(menu: Menu, targets: readonly MultiSelectCandidate<V>[]): void {
		const toggleable = targets.filter(({ locked }) => !locked);
		// Highlighted rows join the checked ones, so checking several and running is one step.
		const runSet = new Map(this.checked);
		for (const candidate of toggleable) runSet.set(candidate.key, candidate);
		if (runSet.size === 0) return;
		menu.addSeparator();
		if (toggleable.length > 0) {
			const allChecked = toggleable.every(({ key }) => this.checked.has(key));
			const suffix = toggleable.length > 1 ? ` ${toggleable.length} selected` : "";
			menu.addItem((item) =>
				item
					.setTitle(`${allChecked ? "Uncheck" : "Check"}${suffix}`)
					.setIcon(allChecked ? "square" : "square-check")
					.onClick(() => this.toggleChecks(toggleable)),
			);
		}
		menu.addItem((item) =>
			item
				.setTitle(
					toggleable.some(({ key }) => !this.checked.has(key))
						? `${this.multiSelect.actionLabel} ${runSet.size} now`
						: `${this.multiSelect.actionLabel} ${runSet.size} checked`,
				)
				.setIcon("corner-down-left")
				.onClick(() => this.confirm([...runSet.values()])),
		);
	}

	private addRemovalMenuItem(menu: Menu, targets: readonly MultiSelectCandidate<V>[]): void {
		const removals = targets.flatMap(({ removal }) => (removal ? [removal] : []));
		if (removals.length === 0) return;
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(
					removals.length > 1
						? `${removals[0].label} (${removals.length} selected)`
						: removals[0].label,
				)
				.setIcon("trash-2")
				.onClick(() => {
					void (async () => {
						// Why: removals may rewrite the same note, so run them one at a time.
						for (const removal of removals) await removal.run();
						this.refreshKeepingSelection();
					})();
				}),
		);
	}

	/** Button at the right end of the input that previews the checked rows and runs them. */
	private createCheckedButton(): void {
		const container = this.inputEl.parentElement;
		if (!container) return;
		container.querySelector(".my-palette-checked-button")?.remove();
		const button = container.createEl("button", {
			cls: "clickable-icon my-palette-checked-button",
			attr: { type: "button", title: "Checked items" },
		});
		setIcon(button, "list-checks");
		this.checkedCountEl = button.createSpan("my-palette-checked-button__count");
		this.checkedButtonEl = button;
		// Keep focus in the input so typing and keyboard selection continue after a click.
		this.registerSelectionDomEvent(button, "mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		this.registerSelectionDomEvent(button, "click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			this.showCheckedMenu(event);
		});
		this.updateCheckedButton();
	}

	private updateCheckedButton(): void {
		if (!this.checkedButtonEl) return;
		this.checkedButtonEl.hidden = this.checked.size === 0;
		this.checkedCountEl?.setText(String(this.checked.size));
	}

	private showCheckedMenu(event: MouseEvent): void {
		if (this.checked.size === 0) return;
		const menu = this.replaceActiveMenu(new Menu());
		menu.addItem((item) =>
			item
				.setTitle(`${this.multiSelect.actionLabel} ${this.checked.size} checked`)
				.setIcon("corner-down-left")
				.onClick(() => this.confirm()),
		);
		menu.addSeparator();
		// Choosing a checked row here unchecks it, so the list doubles as an editor.
		for (const candidate of this.checked.values()) {
			menu.addItem((item) =>
				item
					.setTitle(candidate.item.label)
					.setIcon("square-check")
					.onClick(() => this.toggleChecks([candidate])),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle("Uncheck all")
				.setIcon("square")
				.onClick(() => {
					this.checked.clear();
					this.updateCheckedButton();
					this.rerenderVisibleSuggestions();
				}),
		);
		menu.setParentElement(this.modalEl);
		menu.showAtMouseEvent(event);
	}

	private toSelectionItem(candidate: MultiSelectCandidate<V>): SelectionItem {
		return {
			...candidate.item,
			icon: candidate.locked
				? "lock"
				: this.checked.has(candidate.key)
					? "square-check"
					: (candidate.uncheckedIcon ?? "square"),
		};
	}
}
