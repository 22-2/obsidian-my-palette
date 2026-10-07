import type { App } from "obsidian";
import { MultiSelectModal, type MultiSelectCandidate } from "src/ui/MultiSelectModal";
import type { TagRemoval } from "src/tags/insertTags";
import type { TagChoice } from "src/tags/tagChoices";
import {
	buildTagSuggestions,
	normalizeTagQuery,
	tagSuggestionKey,
	type TagSuggestion,
} from "src/tags/tagSuggestions";

function choiceBadge(choice: TagChoice, targetCount: number): string | undefined {
	if (choice.registered) return "Registered";
	// Partly applied tags say how many notes still lack them; this outranks the ranking reason.
	if (choice.appliedCount) return `On ${choice.appliedCount}/${targetCount} notes`;
	if (choice.reason === "recent") return "Recent";
	// The vault-wide count alone does not tell how common the tag is among related notes.
	if (choice.reason === "related") return `Related ${choice.relatedCount ?? 0}`;
	return undefined;
}

function toCandidate(
	suggestion: TagSuggestion,
	targetCount: number,
	removeTag: (tag: string) => Promise<void>,
): MultiSelectCandidate<string> {
	const key = tagSuggestionKey(suggestion);
	if (suggestion.type === "new") {
		return {
			key,
			value: suggestion.tag,
			item: { label: `#${suggestion.tag}`, badge: "New tag" },
			uncheckedIcon: "plus",
		};
	}
	const { choice } = suggestion;
	return {
		key,
		value: choice.tag,
		item: {
			label: `#${choice.tag}`,
			description: `${choice.count} ${choice.count === 1 ? "note" : "notes"}`,
			badge: choiceBadge(choice, targetCount),
		},
		// Tags every target already has are listed for reference only.
		locked: choice.registered,
		removal: choice.appliedCount
			? { label: "Remove tag", run: () => removeTag(choice.tag) }
			: undefined,
	};
}

/** Multi-tag selector built on the shared toggle selector. */
export class TagSelectionModal extends MultiSelectModal<string> {
	/**
	 * @param choices Candidates in display order, registered tags last.
	 * @param targetLabel Shown in the footer so the user knows which notes change.
	 */
	constructor(
		app: App,
		private choices: readonly TagChoice[],
		targetLabel: string,
		private readonly targetCount: number,
		private readonly removeFromTargets: (tag: string) => Promise<TagRemoval | undefined>,
	) {
		super(
			{
				placeholder: "Select tags to add (type to create a new tag)",
				footerLabel: targetLabel,
				actionLabel: "Add",
				describeSelection: (tags) => tags.map((tag) => `#${tag}`).join(" "),
			},
			app,
		);
	}

	protected searchCandidates(query: string): MultiSelectCandidate<string>[] {
		return buildTagSuggestions(this.choices, query).map((suggestion) =>
			toCandidate(suggestion, this.targetCount, (tag) => this.removeTag(tag)),
		);
	}

	/** Removes from the notes, then shows the tag as unapplied without waiting for the metadata cache. */
	private async removeTag(tag: string): Promise<void> {
		const removal = await this.removeFromTargets(tag);
		if (!removal) return;
		this.choices = this.choices.map((choice) => {
			if (choice.tag !== tag) return choice;
			const { appliedCount: _applied, ...rest } = choice;
			// Notes that still have the tag inline keep counting toward its usage.
			return {
				...rest,
				registered: false,
				count: Math.max(0, choice.count - removal.noLongerUsed),
			};
		});
	}

	// Highlight with the same text used for matching, without the optional `#`.
	protected override matchQuery(query: string): string {
		return normalizeTagQuery(query);
	}

	protected override hasActiveQuery(query: string): boolean {
		return normalizeTagQuery(query) !== "";
	}

	protected override onSelectionModalOpen(): void {
		super.onSelectionModalOpen();
		this.modalEl.addClass("my-palette-tag-select");
	}
}
