import type { App } from "obsidian";
import { bookmarkGroupRows, type BookmarkGroupItem } from "src/search/bookmark/bookmarkGroupRows";
import {
	bookmarkLabel,
	type BookmarkEntry,
	type BookmarksInstance,
} from "src/search/bookmark/bookmarks";
import { SelectionModal, type SelectionItem } from "src/ui/selectionModal";
import { ICONS } from "src/ui/icons";

interface BookmarkGroupOptions {
	placeholder: string;
	footerText: string;
	/** Applies the action to the chosen group; undefined means the top level. */
	onChoose: (parent: BookmarkEntry | undefined, item: BookmarkGroupItem) => void;
	createGroup: (title: string) => BookmarkEntry;
}

/**
 * Bookmark group selector: chooses the group that bookmarks are added to or moved into.
 * Typing a name that no top-level group has offers to create that group.
 */
export class BookmarkGroupModal extends SelectionModal<BookmarkGroupItem> {
	constructor(
		app: App,
		instance: BookmarksInstance,
		private readonly options: BookmarkGroupOptions,
	) {
		super(
			{
				placeholder: options.placeholder,
				footerText: options.footerText,
				search: (query) => bookmarkGroupRows(instance.items ?? [], query),
			},
			app,
		);
	}

	protected override async onItemActivated(item: BookmarkGroupItem): Promise<void> {
		const { target } = item;
		const parent =
			target.kind === "top"
				? undefined
				: target.kind === "group"
					? target.group
					: this.options.createGroup(target.title);
		this.close();
		this.options.onChoose(parent, item);
	}
}

/**
 * A single-line input for a bookmark's title. Enter applies the typed title; an empty input
 * restores the default title (the file name or query).
 */
export class BookmarkTitleModal extends SelectionModal<SelectionItem> {
	constructor(
		app: App,
		entry: BookmarkEntry,
		private readonly onSubmit: (title: string) => void,
	) {
		const fallback = bookmarkLabel({ ...entry, title: undefined });
		super(
			{
				placeholder: "Bookmark title",
				initialInput: entry.title ?? "",
				footerText: `Bookmark: ${entry.path ?? entry.query ?? fallback}`,
				search: (query) => [
					query.trim()
						? { label: `Set title to ${query.trim()}`, icon: ICONS.rename }
						: {
								label: "Use the default title",
								description: fallback,
								icon: ICONS.reset,
							},
				],
			},
			app,
		);
	}

	protected override async onItemActivated(): Promise<void> {
		const title = this.inputEl.value;
		this.close();
		this.onSubmit(title);
	}
}
