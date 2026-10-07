import { Menu, type App } from "obsidian";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";
import type { TagChoice } from "src/tags/tagChoices";
import {
	buildTagSuggestions,
	normalizeTagQuery,
	suggestionTag,
	tagContextActions,
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

/**
 * Multi-tag selector. Choosing a row toggles its check and keeps the modal open;
 * Ctrl+Enter adds the checked tags, any other close cancels. Checked tags are
 * kept by name rather than by row index because the list is filtered again for
 * every query while the checks must survive searches.
 * The row context menu adds or removes that single tag immediately.
 */
export class TagSelectionModal extends BaseSuggestModal<TagSuggestion> {
	private readonly selectedTags = new Set<string>();
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
		const suggestions = buildTagSuggestions(this.choices, query, [...this.selectedTags]);
		this.updateResultCount(suggestions.filter(({ type }) => type === "tag").length);
		return suggestions;
	}

	renderSuggestion(item: TagSuggestion, el: HTMLElement): void {
		renderSelectionItem(this.toSelectionItem(item), el, this.query);
		if (item.type === "tag" && item.choice.registered) el.addClass("is-registered");
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

	protected override onSuggestionContextMenu(item: TagSuggestion, event: MouseEvent): void {
		const tag = suggestionTag(item);
		const actions = tagContextActions(item);
		if (actions.length === 0) return;
		const menu = new Menu();
		for (const action of actions) {
			menu.addItem((menuItem) =>
				menuItem
					.setTitle(this.contextActionTitle(action, tag))
					.setIcon(action === "add" ? "plus" : "trash-2")
					// Only the clicked tag is applied; tags toggled so far are discarded.
					.onClick(() => this.finish({ action, tags: [tag] })),
			);
		}
		// Keep the menu inside the modal so clicking it does not close the modal first.
		menu.setParentElement(this.modalEl);
		menu.showAtMouseEvent(event);
	}

	protected override async onItemActivated(item: TagSuggestion, event: Event): Promise<void> {
		// Ctrl+Enter adds the checked tags from any row.
		const confirmShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (confirmShortcut) {
			if (this.selectedTags.size === 0) return;
			this.finish({ action: "add", tags: [...this.selectedTags] });
			return;
		}
		// Registered tags are listed for reference only.
		if (item.type === "tag" && item.choice.registered) return;

		const tag = suggestionTag(item);
		if (this.selectedTags.has(tag)) this.selectedTags.delete(tag);
		else this.selectedTags.add(tag);
		this.onSelectionChanged();
		// Keep the query but select it, so typing the next tag replaces it directly.
		this.inputEl.select();
	}

	/** Checks only change row icons, so rows are redrawn in place to keep the cursor. */
	private onSelectionChanged(): void {
		this.rerenderVisibleSuggestions();
		const count = this.selectedTags.size;
		// The footer count replaces the old confirm row as the overview of checked tags.
		const selection = count > 0 ? ` · ${count} selected` : "";
		this.updateFooterText(`${this.targets.label}${selection} · ${KEY_HINTS}`);
	}

	private finish(result: TagSelectionResult): void {
		this.result = result;
		this.close();
	}

	private contextActionTitle(action: TagEditAction, tag: string): string {
		if (action === "add") return `Insert #${tag} now`;
		// With several targets only some may have the tag, so no count is promised here.
		return this.targets.count === 1
			? `Remove #${tag} from note`
			: `Remove #${tag} from selected notes`;
	}

	private toSelectionItem(item: TagSuggestion): SelectionItem {
		if (item.type === "new") {
			return {
				label: `#${item.tag}`,
				icon: this.selectedTags.has(item.tag) ? "square-check" : "plus",
				badge: "New tag",
			};
		}
		const { choice } = item;
		return {
			label: `#${choice.tag}`,
			icon: choice.registered
				? "lock"
				: this.selectedTags.has(choice.tag)
					? "square-check"
					: "square",
			description: `${choice.count} ${choice.count === 1 ? "note" : "notes"}`,
			badge: choiceBadge(choice),
		};
	}
}
