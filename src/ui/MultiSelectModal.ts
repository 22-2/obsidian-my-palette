import { Notice, setIcon, type App } from "obsidian";
import { PaletteMenu } from "src/ui/paletteMenu";
import { showMenuAtEvent } from "src/ui/menus";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";
import type { SelectorControls } from "src/ui/selectorControls";
import {
	changeCount,
	directChanges,
	isCheckedRow,
	pendingChanges,
	type MultiSelectChanges,
} from "src/ui/multiSelectChanges";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";
import { ICONS } from "src/ui/icons";

/** One selectable row. `value` is what the modal resolves with when the row is checked. */
export interface MultiSelectCandidate<V> {
	/** Stable identity; checks are kept by key because the list is refiltered per query. */
	key: string;
	value: V;
	/** Row content; the check icon is supplied by the modal. */
	item: SelectionItem;
	/**
	 * Already applied to every target (a tag all targets have, a note linked in both
	 * directions). Such a row starts checked, and clearing its check removes it.
	 */
	applied?: boolean;
	/** Icon of an unchecked row; defaults to an empty box. */
	uncheckedIcon?: string;
	/**
	 * Undoes what the row would apply, offered in its context menu for rows that
	 * are already applied, fully or partly. The host updates its own
	 * data in `run`; the list is refreshed afterwards.
	 */
	removal?: { label: string; run: () => void | Promise<void> };
}

export interface MultiSelectModalProps {
	placeholder: string;
	/** Target context shown in this selector's help. */
	contextLabel: string;
	/** Verb of the run action and of the Ctrl+Enter hint, such as "Add". */
	actionLabel: string;
	controls: SelectorControls;
}

/** Menu title for a run; pure additions keep the familiar "Add 2 now" wording. */
function runTitle<V>(
	changes: MultiSelectChanges<V>,
	actionLabel: string,
	state: "now" | "checked",
): string {
	if (changes.remove.length > 0) return `Apply ${changeCount(changes)} changes`;
	return `${actionLabel} ${changes.add.length} ${state}`;
}

/** Footer text for pending changes, such as "+2 −1". */
function summarizeChanges<V>(changes: MultiSelectChanges<V>): string {
	const parts: string[] = [];
	if (changes.add.length > 0) parts.push(`+${changes.add.length}`);
	if (changes.remove.length > 0) parts.push(`−${changes.remove.length}`);
	return parts.join(" ");
}

/**
 * Multi selector shared by the tag insert, MOC insert and MOC remove selectors so they behave and look alike.
 * Flow: run one row (Enter), or select/check rows (click, Ctrl, Shift, arrows,
 * Space, the check box or context menu) → run them with Ctrl+Enter
 * or the checked-list button. Checking keeps the modal open; any other close cancels.
 */
export abstract class MultiSelectModal<V> extends BaseSuggestModal<MultiSelectCandidate<V>> {
	/** Rows whose check differs from their starting state; these are the pending changes. */
	private readonly toggled = new Map<string, MultiSelectCandidate<V>>();
	private confirmedChanges?: MultiSelectChanges<V>;
	private resolveResult?: (changes: MultiSelectChanges<V> | null) => void;
	private activeMenu?: PaletteMenu;
	private checkedButtonEl?: HTMLElement;
	private checkedCountEl?: HTMLElement;
	private readonly candidateLimit = this.limit;
	/** Keys in the order last listed, kept while checks change so rows do not jump. */
	private listedOrder: string[] = [];
	private keepListedOrder = false;

	constructor(
		private readonly multiSelect: MultiSelectModalProps,
		app: App,
	) {
		super(
			{
				placeholder: multiSelect.placeholder,
				controls: { ...multiSelect.controls, context: multiSelect.contextLabel },
				// Same Explorer-style selection as the palette: pick rows with click,
				// Ctrl and Shift, check them, then run the action.
				selectionMode: "extended",
				// Why: Space checks and f returns to input here, so these single keys need
				// a selection mode that keeps them out of the query. The palette has no
				// such commands and leaves modes off so Enter runs the top row at once.
				interactionModes: true,
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
		_menu: PaletteMenu,
		_selected: readonly MultiSelectCandidate<V>[],
		_close: () => void,
	): void {}

	/** Rows with a pending change, kept listed while the host rebuilds the list. */
	private pendingCandidates(): MultiSelectCandidate<V>[] {
		return [...this.toggled.values()];
	}

	/**
	 * Opens the modal and resolves with the rows to add and the applied rows to
	 * remove, or null when cancelled. Use this when some rows are already applied.
	 */
	openAndWaitChanges(): Promise<MultiSelectChanges<V> | null> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	/** Resolves with the rows to add; for selectors whose rows are never already applied. */
	async openAndWait(): Promise<V[] | null> {
		return (await this.openAndWaitChanges())?.add ?? null;
	}

	async getSuggestions(query: string): Promise<MultiSelectCandidate<V>[]> {
		this.updateMatchQuery(this.matchQuery(query));
		const found = await this.searchCandidates(query);
		const foundByKey = new Map(found.map((candidate) => [candidate.key, candidate]));
		// Pending changes stay visible across queries, even if the host no longer returns them.
		const pending = this.pendingCandidates().map(
			(candidate) => foundByKey.get(candidate.key) ?? candidate,
		);
		// Pinned rows must not use up the space for the next unchecked candidate.
		this.limit = this.candidateLimit + pending.length;
		const rest = found.filter(({ key }) => !this.toggled.has(key));
		// Stable groups keep changed rows first, then rows to add, then applied rows.
		const grouped = [
			...pending,
			...rest.filter(({ applied }) => !applied),
			...rest.filter(({ applied }) => applied),
		];
		const candidates = this.keepListedOrder ? this.inListedOrder(grouped) : grouped;
		this.keepListedOrder = false;
		this.listedOrder = candidates.map(({ key }) => key);
		this.updateResultCount(candidates.length);
		return candidates;
	}

	/**
	 * Why: checking a row would pin it at the top and pull the cursor along with it. Rows keep
	 * their place until the next search; rows shown for the first time, as the limit grows
	 * with each check, come after them.
	 */
	private inListedOrder(
		candidates: readonly MultiSelectCandidate<V>[],
	): MultiSelectCandidate<V>[] {
		const rank = new Map(this.listedOrder.map((key, index) => [key, index]));
		const rankOf = ({ key }: MultiSelectCandidate<V>) => rank.get(key) ?? rank.size;
		return [...candidates].sort((a, b) => rankOf(a) - rankOf(b));
	}

	renderSuggestion(candidate: MultiSelectCandidate<V>, el: HTMLElement): void {
		const checked = this.isChecked(candidate);
		renderSelectionItem(this.toSelectionItem(candidate), el, this.query);
		// Rows may be redrawn in place, so classes are set both ways.
		el.classList.toggle("is-applied", Boolean(candidate.applied));
		el.classList.toggle("is-pending-removal", Boolean(candidate.applied) && !checked);
		el.classList.toggle("is-checked", checked);
		el.setAttribute("aria-checked", String(checked));
		// The check icon toggles its row on a single press, independently of the
		// keyboard mode, so pointer users can also build a checked list.
		el.querySelector(".my-palette-suggestion__icon")?.setAttribute("data-row-toggle", "");
	}

	private isChecked(candidate: MultiSelectCandidate<V>): boolean {
		return isCheckedRow(candidate, this.toggledKeys());
	}

	private toggledKeys(): ReadonlySet<string> {
		return new Set(this.toggled.keys());
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override populateSelectorActions(menu: PaletteMenu): void {
		const targets = this.getSelectedItems();
		this.populateSelectionMenu(menu, targets, () => this.close());
		this.addCheckMenuItems(menu, targets);
		this.addRemovalMenuItem(menu, targets);
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.clearChanges)
				.setDisabled(this.toggled.size === 0)
				.onClick(() => this.clearPendingChanges()),
		);
	}

	protected override onSuggestionContextMenu(
		candidate: MultiSelectCandidate<V>,
		event: MouseEvent,
	): void {
		// The panel has already moved the selection to the clicked row unless the row was
		// inside it, so the menu acts on the selected rows like the palette's own menu.
		const selected = this.getSelectedItems();
		const targets = selected.length > 0 ? selected : [candidate];
		const menu = this.replaceActiveMenu(new PaletteMenu());
		this.populateSelectionMenu(menu, targets, () => this.close());
		this.addCheckMenuItems(menu, targets);
		this.addRemovalMenuItem(menu, targets);
		menu.setParentElement(this.modalEl);
		showMenuAtEvent(menu, event);
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

	protected override handlesSelectionSpace(): boolean {
		return true;
	}

	/** Space checks insertion candidates rather than changing the highlighted selection. */
	protected override onSelectionSpace(selected: MultiSelectCandidate<V>[]): void {
		this.toggleChecks(selected);
	}

	protected override onSelectionModalClose(): void {
		this.activeMenu?.close();
		this.resolveResult?.(this.confirmedChanges ?? null);
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
			// Pending changes win; without any, the highlighted rows to add are run.
			this.confirm(
				this.toggled.size > 0
					? pendingChanges(this.pendingCandidates(), this.toggledKeys())
					: directChanges(this.getSelectedItems().filter(({ applied }) => !applied)),
			);
			return;
		}
		if (event.type !== "keydown") {
			const rows = [...this.getSelectedItems()];
			if (!rows.some(({ key }) => key === candidate.key)) rows.push(candidate);
			this.confirm(directChanges(rows));
			return;
		}
		// Warn before closing so a multi-selection can still be run with Ctrl+Enter.
		if (this.toggled.size > 1 || this.getSelectedItems().length > 1) {
			new Notice(
				`Enter will only ${this.multiSelect.actionLabel.toLowerCase()} "${candidate.item.label}". Press Ctrl+Enter to ${this.multiSelect.actionLabel.toLowerCase()} multiple items, or select a single item and press Enter.`,
			);
			return;
		}
		this.confirm(directChanges([candidate]));
	}

	/** Closes with the given changes; nothing to apply keeps the modal open. */
	private confirm(changes: MultiSelectChanges<V>): void {
		if (changeCount(changes) === 0) return;
		this.commitSearchHistory();
		this.confirmedChanges = changes;
		this.close();
	}

	/** Checks every given row, or unchecks them all when every one is already checked. */
	private toggleChecks(candidates: readonly MultiSelectCandidate<V>[]): void {
		if (candidates.length === 0) return;
		const allChecked = candidates.every((candidate) => this.isChecked(candidate));
		for (const candidate of candidates) {
			if (this.isChecked(candidate) === allChecked) this.flip(candidate);
		}
		// Update icons immediately, then list again in the same order, retaining the cursor
		// and selection by key rather than by their old row indexes.
		this.rerenderVisibleSuggestions();
		this.refreshKeepingSelection();
	}

	/** Toggles one row; a row back in its starting state leaves the pending changes. */
	private flip(candidate: MultiSelectCandidate<V>): void {
		if (this.toggled.has(candidate.key)) this.toggled.delete(candidate.key);
		else this.toggled.set(candidate.key, candidate);
	}

	/** Drops every pending change; applied rows show as checked again. */
	private clearPendingChanges(): void {
		this.toggled.clear();
		this.refreshKeepingSelection();
	}

	private refreshKeepingSelection(): void {
		this.updateCheckedButton();
		this.keepListedOrder = true;
		this.refreshSuggestionsKeepingSelection((a, b) => a.key === b.key);
	}

	private replaceActiveMenu(menu: PaletteMenu): PaletteMenu {
		this.activeMenu?.close();
		this.activeMenu = menu;
		menu.onHide(() => {
			if (this.activeMenu === menu) this.activeMenu = undefined;
		});
		return menu;
	}

	private addCheckMenuItems(
		menu: PaletteMenu,
		targets: readonly MultiSelectCandidate<V>[],
	): void {
		// Highlighted rows join the pending ones, so checking several and running is one step.
		const runSet = new Map(this.toggled);
		for (const candidate of targets) runSet.set(candidate.key, candidate);
		if (runSet.size === 0) return;
		const changes = pendingChanges([...runSet.values()], this.toggledKeys());
		menu.addSeparator();
		if (targets.length > 0) {
			const allChecked = targets.every((candidate) => this.isChecked(candidate));
			const suffix = targets.length > 1 ? ` ${targets.length} selected` : "";
			menu.addItem((item) =>
				item
					.setTitle(`${allChecked ? "Uncheck" : "Check"}${suffix}`)
					.setIcon(allChecked ? ICONS.unchecked : ICONS.checked)
					.onClick(() => this.toggleChecks(targets)),
			);
		}
		if (changeCount(changes) === 0) return;
		const addsPending = targets.some((candidate) => !this.isChecked(candidate));
		menu.addItem((item) =>
			item
				.setTitle(
					runTitle(
						changes,
						this.multiSelect.actionLabel,
						addsPending ? "now" : "checked",
					),
				)
				.setIcon(ICONS.confirm)
				.onClick(() => this.confirm(changes)),
		);
	}

	private addRemovalMenuItem(
		menu: PaletteMenu,
		targets: readonly MultiSelectCandidate<V>[],
	): void {
		const removable = targets.filter((candidate) => candidate.removal);
		if (removable.length === 0) return;
		const label = removable[0].removal?.label ?? "";
		menu.addSeparator();
		menu.addItem((item) =>
			item
				.setTitle(removable.length > 1 ? `${label} (${removable.length} selected)` : label)
				.setIcon(ICONS.delete)
				.onClick(() => {
					void (async () => {
						// Why: removals may rewrite the same note, so run them one at a time.
						for (const candidate of removable) {
							await candidate.removal?.run();
							// The removal is now real, so the row must not stay pending.
							this.toggled.delete(candidate.key);
						}
						this.refreshKeepingSelection();
					})();
				}),
		);
	}

	/** Button before the shared input controls that previews the checked rows and runs them. */
	private createCheckedButton(): void {
		const container = this.inputEl.parentElement;
		if (!container) return;
		container.querySelector(".my-palette-checked-button")?.remove();
		const button = container.createEl("button", {
			cls: "clickable-icon my-palette-checked-button",
			attr: { type: "button", title: "Checked items" },
		});
		container.insertBefore(button, container.querySelector(".my-palette-options-button"));
		setIcon(button, ICONS.selection);
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
		const changes = pendingChanges(this.pendingCandidates(), this.toggledKeys());
		this.checkedButtonEl.hidden = this.toggled.size === 0;
		this.checkedCountEl?.setText(summarizeChanges(changes));
	}

	private showCheckedMenu(event: MouseEvent): void {
		if (this.toggled.size === 0) return;
		const changes = pendingChanges(this.pendingCandidates(), this.toggledKeys());
		const menu = this.replaceActiveMenu(new PaletteMenu());
		menu.addItem((item) =>
			item
				.setTitle(runTitle(changes, this.multiSelect.actionLabel, "checked"))
				.setIcon(ICONS.confirm)
				.onClick(() => this.confirm(changes)),
		);
		menu.addSeparator();
		// Choosing a pending row here reverts it, so the list doubles as an editor.
		for (const candidate of this.toggled.values()) {
			menu.addItem((item) =>
				item
					.setTitle(candidate.item.label)
					.setIcon(this.isChecked(candidate) ? ICONS.checked : ICONS.unchecked)
					.onClick(() => this.toggleChecks([candidate])),
			);
		}
		menu.addSeparator();
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.clearChanges).onClick(() => this.clearPendingChanges()),
		);
		menu.setParentElement(this.modalEl);
		showMenuAtEvent(menu, event);
	}

	private toSelectionItem(candidate: MultiSelectCandidate<V>): SelectionItem {
		return {
			...candidate.item,
			icon: this.isChecked(candidate)
				? "square-check"
				: (candidate.uncheckedIcon ?? "square"),
		};
	}
}
