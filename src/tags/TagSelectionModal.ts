import { Menu, type App } from "obsidian";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";
import type { TagChoice } from "src/tags/tagChoices";
import {
	buildTagSuggestions,
	normalizeTagQuery,
	isCheckable,
	suggestionTag,
	tagContextActions,
	toggleChecks,
	type TagEditAction,
	type TagSuggestion,
} from "src/tags/tagSuggestions";

const KEY_HINTS = "Enter: toggle · Ctrl+Enter: add · Right-click: more · Esc: cancel";

export interface TagSelectionResult {
	action: TagEditAction;
	/** Tags without `#`. */
	tags: string[];
}

export interface TagSelectionTargets {
	/** Shown in the footer so the user knows which notes change. */
	label: string;
	count: number;
}

function choiceBadge(choice: TagChoice): string | undefined {
	if (choice.registered) return "Registered";
	if (choice.reason === "recent") return "Recent";
	// The vault-wide count alone does not tell how common the tag is among related notes.
	if (choice.reason === "related") return `Related ${choice.relatedCount ?? 0}`;
	return undefined;
}

/** `#tag` for one tag, otherwise a count, to keep menu titles short. */
function tagsText(tags: readonly string[]): string {
	return tags.length === 1 ? `#${tags[0]}` : `${tags.length} tags`;
}

/**
 * Multi-tag selector. Checks are toggled on the highlighted rows and the modal
 * stays open; Ctrl+Enter adds the checked tags, any other close cancels. Checked
 * tags are kept by name rather than by row index because the list is filtered
 * again for every query while the checks must survive searches.
 * Rows use extended selection so the context menu can act on several rows.
 */
export class TagSelectionModal extends BaseSuggestModal<TagSuggestion> {
	private checkedTags = new Set<string>();
	private result: TagSelectionResult | null = null;
	private resolveResult?: (result: TagSelectionResult | null) => void;

	/**
	 * @param choices Candidates in display order, registered tags last.
	 */
	constructor(
		app: App,
		private readonly choices: readonly TagChoice[],
		private readonly targets: TagSelectionTargets,
	) {
		super(
			{
				placeholder: "Select tags to add (type to create a new tag)",
				footerText: `${targets.label} · ${KEY_HINTS}`,
				selectionMode: "extended",
			},
			app,
		);
	}

	/** Opens the modal and resolves with the requested edit, or null when cancelled. */
	openAndWait(): Promise<TagSelectionResult | null> {
		return new Promise((resolve) => {
			this.resolveResult = resolve;
			this.open();
		});
	}

	getSuggestions(query: string): TagSuggestion[] {
		// Highlight with the same text used for matching, without the optional `#`.
		this.updateMatchQuery(normalizeTagQuery(query));
		const suggestions = buildTagSuggestions(this.choices, query, [...this.checkedTags]);
		this.updateResultCount(suggestions.filter(({ type }) => type === "tag").length);
		return suggestions;
	}

	renderSuggestion(item: TagSuggestion, el: HTMLElement): void {
		renderSelectionItem(this.toSelectionItem(item), el, this.query);
		if (item.type === "tag" && item.choice.registered) el.addClass("is-registered");
		// The check icon toggles its row on a single click; extended selection
		// otherwise needs a double-click or Enter to change a check.
		if (isCheckable(item))
			el.querySelector(".my-palette-suggestion__icon")?.setAttribute("data-row-toggle", "");
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-tag-select");
	}

	protected override onSelectionModalClose(): void {
		this.resolveResult?.(this.result);
		this.resolveResult = undefined;
	}

	protected override handlesSuggestionContextMenu(): boolean {
		return true;
	}

	protected override onSuggestionContextMenu(_item: TagSuggestion, event: MouseEvent): void {
		// The panel keeps a multi-selection that contains the clicked row, otherwise
		// it selects just that row, so the highlighted rows are the menu's subject.
		const rows = this.getSelectedItems();
		const checkable = rows.filter(isCheckable).map(suggestionTag);
		const addable = rows.filter((row) => tagContextActions(row).includes("add"));
		const removable = rows.filter((row) => tagContextActions(row).includes("remove"));
		// Checked tags are inserted too, so checking several and inserting is one step.
		const insertTags = [...new Set([...this.checkedTags, ...addable.map(suggestionTag)])];
		const removeTags = removable.map(suggestionTag);
		if (checkable.length === 0 && insertTags.length === 0 && removeTags.length === 0) return;

		const menu = new Menu();
		if (checkable.length > 0) {
			const uncheck = checkable.every((tag) => this.checkedTags.has(tag));
			menu.addItem((menuItem) =>
				menuItem
					.setTitle(`${uncheck ? "Uncheck" : "Check"} ${tagsText(checkable)}`)
					.setIcon(uncheck ? "square" : "square-check")
					.onClick(() => this.toggle(checkable)),
			);
		}
		if (insertTags.length > 0) {
			menu.addItem((menuItem) =>
				menuItem
					.setTitle(`Insert ${tagsText(insertTags)} now`)
					.setIcon("plus")
					.onClick(() => this.finish({ action: "add", tags: insertTags })),
			);
		}
		if (removeTags.length > 0) {
			// With several targets only some may have the tag, so no count is promised here.
			const notes = this.targets.count === 1 ? "note" : "selected notes";
			menu.addItem((menuItem) =>
				menuItem
					.setTitle(`Remove ${tagsText(removeTags)} from ${notes}`)
					.setIcon("trash-2")
					.onClick(() => this.finish({ action: "remove", tags: removeTags })),
			);
		}
		// Keep the menu inside the modal so clicking it does not close the modal first.
		menu.setParentElement(this.modalEl);
		menu.showAtMouseEvent(event);
	}

	protected override handlesSuggestionRowToggle(): boolean {
		return true;
	}

	protected override onSuggestionRowToggle(item: TagSuggestion): void {
		if (isCheckable(item)) this.toggle([suggestionTag(item)]);
	}

	protected override async onItemActivated(item: TagSuggestion, event: Event): Promise<void> {
		// Ctrl+Enter adds the checked tags from any row.
		const confirmShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (confirmShortcut) {
			if (this.checkedTags.size === 0) return;
			this.finish({ action: "add", tags: [...this.checkedTags] });
			return;
		}
		// Enter and double-click toggle every highlighted row, matching the menu action.
		const rows = this.getSelectedItems();
		const tags = (rows.length > 0 ? rows : [item]).filter(isCheckable).map(suggestionTag);
		if (tags.length === 0) return;
		this.toggle(tags);
		// Keep the query but select it, so typing the next tag replaces it directly.
		this.inputEl.select();
	}

	/** Checks only change row icons, so rows are redrawn in place to keep the cursor. */
	private toggle(tags: readonly string[]): void {
		this.checkedTags = toggleChecks(this.checkedTags, tags);
		this.rerenderVisibleSuggestions();
		const count = this.checkedTags.size;
		// The footer count is the overview of checks hidden by the current filter.
		const selection = count > 0 ? ` · ${count} checked` : "";
		this.updateFooterText(`${this.targets.label}${selection} · ${KEY_HINTS}`);
	}

	private finish(result: TagSelectionResult): void {
		this.result = result;
		this.close();
	}

	private toSelectionItem(item: TagSuggestion): SelectionItem {
		if (item.type === "new") {
			return {
				label: `#${item.tag}`,
				icon: this.checkedTags.has(item.tag) ? "square-check" : "plus",
				badge: "New tag",
			};
		}
		const { choice } = item;
		return {
			label: `#${choice.tag}`,
			icon: choice.registered
				? "lock"
				: this.checkedTags.has(choice.tag)
					? "square-check"
					: "square",
			description: `${choice.count} ${choice.count === 1 ? "note" : "notes"}`,
			badge: choiceBadge(choice),
		};
	}
}
