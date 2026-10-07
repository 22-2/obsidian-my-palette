import type { App } from "obsidian";
import { BaseSuggestModal } from "src/ui/baseSuggestModal";
import { renderSelectionItem, type SelectionItem } from "src/ui/selectionModal";
import type { TagChoice } from "src/tags/tagChoices";
import {
	buildTagSuggestions,
	normalizeTagQuery,
	tagSuggestionKey,
	type TagSuggestion,
} from "src/tags/tagSuggestions";

const KEY_HINTS = "Enter: toggle · Ctrl+Enter: add · Esc: cancel";

function choiceBadge(choice: TagChoice): string | undefined {
	if (choice.registered) return "Registered";
	if (choice.reason === "recent") return "Recent";
	// The vault-wide count alone does not tell how common the tag is among related notes.
	if (choice.reason === "related") return `Related ${choice.relatedCount ?? 0}`;
	return undefined;
}

/**
 * Multi-tag selector. Choosing a row toggles it and keeps the modal open; the
 * confirm row or Ctrl+Enter resolves the selection, any other close cancels.
 * Selected tags are kept by name rather than by row index because the list is
 * filtered again for every query while the selection must survive searches.
 */
export class TagSelectionModal extends BaseSuggestModal<TagSuggestion> {
	private readonly selectedTags = new Set<string>();
	private confirmed = false;
	private resolveResult?: (tags: string[] | null) => void;

	/**
	 * @param choices Candidates in display order, registered tags last.
	 * @param targetLabel Shown in the footer so the user knows which notes change.
	 */
	constructor(
		app: App,
		private readonly choices: readonly TagChoice[],
		targetLabel: string,
	) {
		super(
			{
				placeholder: "Select tags to add (type to create a new tag)",
				footerText: `${targetLabel} · ${KEY_HINTS}`,
			},
			app,
		);
	}

	/** Opens the modal and resolves with tags without `#`, or null when cancelled. */
	openAndWait(): Promise<string[] | null> {
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
		if (item.type === "confirm") {
			// The action word is muted so the selected tags stand out in the confirm row.
			const label = el.querySelector<HTMLElement>(".my-palette-suggestion__label");
			label?.prepend(
				label.createSpan({ cls: "my-palette-tag-select__action", text: "Add " }),
			);
		}
	}

	protected override onSelectionModalOpen(): void {
		this.modalEl.addClass("my-palette-tag-select");
	}

	protected override onSelectionModalClose(): void {
		this.resolveResult?.(this.confirmed ? [...this.selectedTags] : null);
		this.resolveResult = undefined;
	}

	protected override async onItemActivated(item: TagSuggestion, event: Event): Promise<void> {
		// Ctrl+Enter confirms from any row so the user need not move to the confirm row.
		const confirmShortcut =
			event.type === "keydown" &&
			((event as KeyboardEvent).ctrlKey || (event as KeyboardEvent).metaKey);
		if (item.type === "confirm" || confirmShortcut) {
			if (this.selectedTags.size === 0) return;
			this.confirmed = true;
			this.close();
			return;
		}
		// Registered tags are listed for reference only.
		if (item.type === "tag" && item.choice.registered) return;

		const tag = item.type === "new" ? item.tag : item.choice.tag;
		if (this.selectedTags.has(tag)) this.selectedTags.delete(tag);
		else this.selectedTags.add(tag);

		const key = tagSuggestionKey(item);
		this.refreshSuggestionsKeepingCursor((candidate) => tagSuggestionKey(candidate) === key);
		// Keep the query but select it, so typing the next tag replaces it directly.
		this.inputEl.select();
	}

	private toSelectionItem(item: TagSuggestion): SelectionItem {
		if (item.type === "confirm") {
			return {
				// "Add " is prepended in renderSuggestion so it can be styled separately.
				label: item.tags.map((tag) => `#${tag}`).join(" "),
				icon: "corner-down-left",
			};
		}
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
