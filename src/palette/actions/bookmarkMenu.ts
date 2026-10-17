import { Notice } from "obsidian";
import type MyPalettePlugin from "src/main";
import { resolveVaultFile } from "src/palette/actions/resultFile";
import type { PaletteResult } from "src/palette/results";
import { BookmarkGroupModal, BookmarkTitleModal } from "src/search/bookmark/BookmarkGroupModal";
import type { BookmarkGroupItem } from "src/search/bookmark/bookmarkGroupRows";
import {
	addFileBookmarks,
	canEditBookmarks,
	createBookmarkGroup,
	getBookmarksInstance,
	moveBookmarks,
	removeBookmarks,
	setBookmarkTitle,
	type BookmarkEntry,
} from "src/search/bookmark/bookmarks";
import type { PaletteMenu } from "src/ui/paletteMenu";
import { MENU_ACTIONS, withAction } from "src/ui/menuActions";

interface BookmarkMenuOptions {
	menu: PaletteMenu;
	plugin: MyPalettePlugin;
	/** The clicked result, or every selected result for a bulk menu. */
	results: readonly PaletteResult[];
	/** Re-runs the search so renamed, moved or removed bookmarks show their new state. */
	onBookmarksChanged?: () => void;
	/** Closes a modal palette once files were bookmarked from another mode. */
	onNoteActionDone?: () => void;
}

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

function bookmarkEntries(results: readonly PaletteResult[]): BookmarkEntry[] {
	return results.flatMap((result) =>
		result.mode === "bookmark" && result.entry ? [result.entry] : [],
	);
}

/** Names the destination in a notice: the group's full path, or the top level. */
function destinationName(chosen: BookmarkGroupItem): string {
	switch (chosen.target.kind) {
		case "top":
			return "the top level";
		case "group":
			return chosen.description ?? chosen.label;
		case "new":
			return chosen.target.title;
	}
}

/**
 * Adds the Bookmarks plugin's operations to a result menu. Bookmarks mode results can be
 * retitled, moved to another group and removed; files from any other mode can be bookmarked.
 * Nothing is added while the core Bookmarks plugin is off.
 */
export function addBookmarkMenuItems({
	menu,
	plugin,
	results,
	onBookmarksChanged,
	onNoteActionDone,
}: BookmarkMenuOptions): void {
	const { app } = plugin;
	const instance = getBookmarksInstance(app);
	if (!canEditBookmarks(instance)) return;

	const entries = bookmarkEntries(results);
	if (entries.length > 0) {
		if (entries.length === 1) {
			const [entry] = entries;
			menu.addItem((item) =>
				withAction(item, MENU_ACTIONS.renameBookmark).onClick(() => {
					const modal = new BookmarkTitleModal(app, entry, (title) => {
						setBookmarkTitle(instance, entry, title);
						onBookmarksChanged?.();
					});
					modal.open();
					// Why: the current title is selected so typing replaces it.
					modal.inputEl.select();
				}),
			);
		}
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.moveToBookmarkGroup).onClick(() =>
				new BookmarkGroupModal(app, instance, {
					placeholder: "Search bookmark groups",
					footerText: `Moving: ${plural(entries.length, "bookmark")}`,
					createGroup: (title) => createBookmarkGroup(instance, title),
					onChoose: (parent, chosen) => {
						const moved = moveBookmarks(instance, entries, parent);
						const name = destinationName(chosen);
						new Notice(
							moved > 0
								? `Moved ${plural(moved, "bookmark")} to ${name}`
								: `Already in ${name}`,
						);
						onBookmarksChanged?.();
					},
				}).open(),
			),
		);
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.removeFromBookmarks).onClick(() => {
				const removed = removeBookmarks(instance, entries);
				new Notice(`Removed ${plural(removed, "bookmark")}`);
				onBookmarksChanged?.();
			}),
		);
		return;
	}

	const paths = [
		...new Set(results.flatMap((result) => resolveVaultFile(app, result)?.path ?? [])),
	];
	if (paths.length === 0) return;
	menu.addItem((item) =>
		withAction(item, MENU_ACTIONS.addToBookmarks).onClick(() =>
			new BookmarkGroupModal(app, instance, {
				placeholder: "Search bookmark groups",
				footerText:
					paths.length === 1
						? `Bookmarking: ${paths[0]}`
						: `Bookmarking: ${plural(paths.length, "file")}`,
				createGroup: (title) => createBookmarkGroup(instance, title),
				onChoose: (parent, chosen) => {
					const { added, skipped } = addFileBookmarks(instance, paths, parent);
					const name = destinationName(chosen);
					new Notice(
						added > 0
							? `Bookmarked ${plural(added, "file")} in ${name}` +
									(skipped > 0 ? ` (${skipped} already there)` : "")
							: `Already bookmarked in ${name}`,
					);
					if (added > 0) onNoteActionDone?.();
				},
			}).open(),
		),
	);
}
