import fuzzysort from "fuzzysort";
import {
	BOOKMARK_PATH_SEPARATOR,
	bookmarkLabel,
	listBookmarkGroups,
	type BookmarkEntry,
} from "src/search/bookmark/bookmarks";
import type { SelectionItem } from "src/ui/selectionModal";
import { ICONS } from "src/ui/icons";
import { t } from "src/i18n";

/** 移動先の行: 最上位、既存のグループ、または入力から作るグループ。 */
export interface BookmarkGroupItem extends SelectionItem {
	target:
		| { kind: "top" }
		| { kind: "group"; group: BookmarkEntry }
		| { kind: "new"; title: string };
}

/** クエリに対する行: 一致するグループ、次に入力した名前のグループを作る行。 */
export function bookmarkGroupRows(
	items: readonly BookmarkEntry[],
	query: string,
): BookmarkGroupItem[] {
	const groups: BookmarkGroupItem[] = listBookmarkGroups(items).map(({ group, path }) => ({
		label: bookmarkLabel(group),
		description: path.join(BOOKMARK_PATH_SEPARATOR),
		icon: ICONS.folder,
		target: { kind: "group", group },
	}));
	const top: BookmarkGroupItem = {
		label: t("bookmark.topLevel"),
		description: t("bookmark.group.outside"),
		icon: ICONS.bookmark,
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
			label: t("bookmark.group.createNew", { title }),
			description: t("bookmark.group.createHint"),
			icon: ICONS.newBookmarkGroup,
			target: { kind: "new", title },
		},
	];
}
