import { Notice } from "obsidian";
import { t } from "src/i18n";
import type { SelectorControls } from "src/ui/selectorControls";
import { MultiSelectModal, type MultiSelectCandidate } from "src/ui/MultiSelectModal";
import type { TagRemoval } from "src/tags/insertTags";
import type { TagChoice } from "src/tags/tagChoices";
import {
	buildTagSuggestions,
	normalizeTagQuery,
	tagSuggestionKey,
	type TagSuggestion,
} from "src/tags/tagSuggestions";
import { getGlobalSearch } from "src/platform/obsidianInternals";

function choiceBadge(choice: TagChoice, targetCount: number): string | undefined {
	if (choice.registered) return "Registered";
	// 一部のノートにだけ付いているタグは、残りのノートにまだ無いことを示すので、関連度の理由より優先する。
	if (choice.appliedCount) return `On ${choice.appliedCount}/${targetCount} notes`;
	if (choice.reason === "recent") return "Recent";
	// 保管庫全体の件数だけでは、関連ノートの中でそのタグがどれほど一般的かは分からない。
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
			item: { label: `#${suggestion.tag}`, badge: t("tag.badge.new") },
			uncheckedIcon: "plus",
		};
	}
	const { choice } = suggestion;
	return {
		key,
		value: choice.tag,
		item: {
			label: `#${choice.tag}`,
			description: t("tag.noteCount", { count: choice.count }),
			badge: choiceBadge(choice, targetCount),
		},
		// 対象のすべてのノートが持つタグは最初からチェック済みにし、チェックを外すと削除する。
		applied: choice.registered,
		removal: choice.appliedCount
			? { label: t("tag.remove"), run: () => removeTag(choice.tag) }
			: undefined,
	};
}

/** Tag insert selector built on the shared multi selector. */
export class TagSelectionModal extends MultiSelectModal<string> {
	/**
	 * @param choices Candidates in display order, registered tags last.
	 * @param targetLabel Shown in help so the user knows which notes change.
	 */
	constructor(
		private readonly plugin: SelectorControls["plugin"],
		private choices: readonly TagChoice[],
		targetLabel: string,
		private readonly targetCount: number,
		private readonly removeFromTargets: (tag: string) => Promise<TagRemoval | undefined>,
	) {
		super(
			{
				placeholder: t("tag.placeholder"),
				contextLabel: targetLabel,
				actionLabel: t("tag.controls.add"),
				controls: {
					plugin,
					category: "tag-insertion",
					title: t("tag.controls.title"),
					description: t("tag.controls.description"),
					actionLabel: t("tag.controls.add"),
					shortcuts: [
						["→", t("tag.shortcut.preview")],
						["Space", t("tag.shortcut.toggle")],
						["Ctrl+Enter", t("tag.shortcut.apply")],
					],
				},
			},
			plugin.app,
		);
	}

	protected searchCandidates(query: string): MultiSelectCandidate<string>[] {
		return buildTagSuggestions(this.choices, query).map((suggestion) =>
			toCandidate(suggestion, this.targetCount, (tag) => this.removeTag(tag)),
		);
	}

	protected override handlesSuggestionPreview(): boolean {
		return true;
	}

	protected override async onSuggestionPreview(
		candidate: MultiSelectCandidate<string>,
	): Promise<void> {
		const search = getGlobalSearch(this.plugin.app);
		if (!search) {
			new Notice(t("tag.notice.noSearchCore"));
			return;
		}
		// コア API の 2 番目の引数で、リーフを有効化せずに検索を表示する。
		search.openGlobalSearch(`tag:#${candidate.value}`, false);
	}

	/** Removes from the notes, then shows the tag as unapplied without waiting for the metadata cache. */
	private async removeTag(tag: string): Promise<void> {
		const removal = await this.removeFromTargets(tag);
		if (!removal) return;
		this.choices = this.choices.map((choice) => {
			if (choice.tag !== tag) return choice;
			const { appliedCount: _applied, ...rest } = choice;
			// まだインラインでタグを持つノートは、タグの使用数に含め続ける。
			return {
				...rest,
				registered: false,
				count: Math.max(0, choice.count - removal.noLongerUsed),
			};
		});
	}

	// 一致判定と同じテキストでハイライトする。省略可能な `#` は除く。
	protected override matchQuery(query: string): string {
		return normalizeTagQuery(query);
	}

	protected override onSelectionModalOpen(): void {
		super.onSelectionModalOpen();
		this.modalEl.addClass("my-palette-tag-select");
	}
}
