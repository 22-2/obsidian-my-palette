import { Menu, type App } from "obsidian";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";

/** One selectable row. `value` is what the modal resolves with when the row is chosen. */
export interface MultiSelectCandidate<V> {
	/** Stable identity; the selection is kept by key because the list is refiltered per query. */
	key: string;
	value: V;
	/** Row content; the check icon is supplied by the modal. */
	item: SelectionItem;
	/**
	 * Nothing is left to do for this row (a tag every target already has, a note
	 * already linked in both directions). It stays listed after the actionable
	 * rows, marked by the lock icon, and cannot be selected.
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

export type MultiSelectRow<V> =
	| { type: "candidate"; candidate: MultiSelectCandidate<V> }
	| { type: "confirm"; values: V[] };

export interface MultiSelectModalProps<V> {
	placeholder: string;
	/** Footer text naming what changes; the key hints are appended. */
	footerLabel: string;
	/** Verb of the confirm row and of the Ctrl+Enter hint, such as "Add". */
	actionLabel: string;
	/** Text of the confirm row, summarizing the selected values. */
	describeSelection: (values: V[]) => string;
}

function rowKey<V>(row: MultiSelectRow<V>): string {
	return row.type === "confirm" ? "confirm" : `candidate:${row.candidate.key}`;
}

/**
 * Multi selector shared by tag and MOC insertion so both behave and look alike.
 * Flow: select rows (click, Ctrl, Shift, arrows) → check them (Enter, double
 * click, or the check box) → run (Ctrl+Enter or the confirm row). Checking keeps
 * the modal open; any other close cancels.
 */
export abstract class MultiSelectModal<V> extends BaseSuggestModal<MultiSelectRow<V>> {
	private readonly checked = new Map<string, MultiSelectCandidate<V>>();
	private confirmed = false;
	private resolveResult?: (values: V[] | null) => void;

	constructor(
		private readonly multiSelect: MultiSelectModalProps<V>,
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

	/** Whether the input narrows the list, which decides where the confirm row goes. */
	protected hasActiveQuery(query: string): boolean {
		return query.trim() !== "";
	}

	/** Lets hosts add their own items above the shared removal item. */
	protected populateCandidateMenu(
		_menu: Menu,
		_candidate: MultiSelectCandidate<V>,
		_close: () => void,
	): void {}

	/** Opens the modal and resolves with the selected values, or null when cancelled. */
	openAndWait(): Promise<V[] | null> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	async getSuggestions(query: string): Promise<MultiSelectRow<V>[]> {
		this.updateMatchQuery(this.matchQuery(query));
		const found = await this.searchCandidates(query);
		// A stable partition keeps the host's ranking inside each group.
		const candidates = [
			...found.filter(({ locked }) => !locked),
			...found.filter(({ locked }) => locked),
		];
		this.updateResultCount(candidates.length);
		const rows: MultiSelectRow<V>[] = candidates.map((candidate) => ({
			type: "candidate",
			candidate,
		}));
		if (this.checked.size > 0) {
			const confirm: MultiSelectRow<V> = {
				type: "confirm",
				values: this.checkedValues(),
			};
			// Without a query the confirm row comes first so Enter can confirm immediately;
			// while searching it goes last so it does not hide the best match.
			if (this.hasActiveQuery(query)) rows.push(confirm);
			else rows.unshift(confirm);
		}
		return rows;
	}

	renderSuggestion(row: MultiSelectRow<V>, el: HTMLElement): void {
		renderSelectionItem(this.toSelectionItem(row), el, this.query);
		if (row.type === "candidate" && row.candidate.locked) el.addClass("is-locked");
		if (row.type === "confirm") {
			// The action word is muted so the selected values stand out in the confirm row.
			const label = el.querySelector<HTMLElement>(".my-palette-suggestion__label");
			label?.prepend(
				label.createSpan({
					cls: "my-palette-multi-select__action",
					text: `${this.multiSelect.actionLabel} `,
				}),
			);
		}
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override onSuggestionContextMenu(row: MultiSelectRow<V>, event: MouseEvent): void {
		if (row.type !== "candidate") return;
		const { candidate } = row;
		const menu = new Menu();
		this.populateCandidateMenu(menu, candidate, () => this.close());
		// The panel has already moved the selection to the clicked row unless the row was
		// inside it, so the menu acts on the selected rows like the palette's own menu.
		const targets = this.selectedCandidates();
		const removals = targets.flatMap(({ removal }) => (removal ? [removal] : []));
		if (removals.length > 0) {
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
		// An empty menu would only flash, so rows without any action show nothing.
		if (menu.items?.length === 0) return;
		menu.showAtMouseEvent(event);
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-multi-select");
	}

	protected override onSelectionModalClose(): void {
		this.resolveResult?.(this.confirmed ? this.checkedValues() : null);
		this.resolveResult = undefined;
	}

	protected override async onItemActivated(row: MultiSelectRow<V>, event: Event): Promise<void> {
		// Ctrl+Enter confirms from any row so the user need not move to the confirm row.
		const confirmShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (row.type === "confirm" || confirmShortcut) {
			if (this.checked.size === 0) return;
			this.confirmed = true;
			this.close();
			return;
		}
		// Enter checks every selected row at once; the activated row is included even
		// if a rerender left it out of the selection.
		const rows = this.selectedCandidates();
		if (!rows.some(({ key }) => key === row.candidate.key)) rows.push(row.candidate);
		this.toggleChecks(rows);
	}

	protected override handlesSuggestionIconClick(): boolean {
		return true;
	}

	/** Clicking a row's check box checks just that row without running anything. */
	protected override onSuggestionIconClick(row: MultiSelectRow<V>): void {
		if (row.type === "candidate") this.toggleChecks([row.candidate]);
	}

	/** Candidates among the selected rows, in list order. */
	private selectedCandidates(): MultiSelectCandidate<V>[] {
		return this.getSelectedItems().flatMap((row) =>
			row.type === "candidate" ? [row.candidate] : [],
		);
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
		this.refreshKeepingSelection();
		// Keep the query but select it, so typing the next entry replaces it directly.
		this.inputEl.select();
	}

	private refreshKeepingSelection(): void {
		this.refreshSuggestionsKeepingSelection((a, b) => rowKey(a) === rowKey(b));
	}

	private checkedValues(): V[] {
		return [...this.checked.values()].map(({ value }) => value);
	}

	private toSelectionItem(row: MultiSelectRow<V>): SelectionItem {
		if (row.type === "confirm") {
			// The action word is prepended in renderSuggestion so it can be styled separately.
			return {
				label: this.multiSelect.describeSelection(row.values),
				icon: "corner-down-left",
			};
		}
		const { candidate } = row;
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
