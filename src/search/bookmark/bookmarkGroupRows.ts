import fuzzysort from "fuzzysort";
import {
	BOOKMARK_PATH_SEPARATOR,
	bookmarkLabel,
	listBookmarkGroups,
	type BookmarkEntry,
} from "src/search/bookmark/bookmarks";
import type { SelectionItem } from "src/ui/selectionModal";

/** A destination row: the top level, an existing group, or a group to create from the input. */
export interface BookmarkGroupItem extends SelectionItem {
	target:
		| { kind: "top" }
		| { kind: "group"; group: BookmarkEntry }
		| { kind: "new"; title: string };
}

/** The rows for a query: matching groups, then a row that creates a group named by the input. */
export function bookmarkGroupRows(
	items: readonly BookmarkEntry[],
	query: string,
): BookmarkGroupItem[] {
	const groups: BookmarkGroupItem[] = listBookmarkGroups(items).map(({ group, path }) => ({
		label: bookmarkLabel(group),
		description: path.join(BOOKMARK_PATH_SEPARATOR),
		icon: "folder",
		target: { kind: "group", group },
	}));
	const top: BookmarkGroupItem = {
		label: "Top level",
		description: "Outside any group",
		icon: "bookmark",
		target: { kind: "top" },
	};
	const title = query.trim();
	if (!title) return [top, ...groups];
	const matches = fuzzysort
		.go(title, [top, ...groups], { keys: ["label", "description"] })
		.map(({ obj }) => obj);
	const exists = items.some(
		(item) =>
			item.type === "group" &&
			bookmarkLabel(item).toLocaleLowerCase() === title.toLocaleLowerCase(),
	);
	if (exists) return matches;
	return [
		...matches,
		{
			label: `New group: ${title}`,
			description: "Create a group at the top level",
			icon: "folder-plus",
			target: { kind: "new", title },
		},
	];
}
