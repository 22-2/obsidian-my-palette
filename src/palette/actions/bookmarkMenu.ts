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
import { countLabel } from "src/shared/countLabel";
import { t } from "src/i18n";

interface BookmarkMenuOptions {
	menu: PaletteMenu;
	plugin: MyPalettePlugin;
	/** クリックされた結果。一括のメニューでは、選択されたすべての結果。 */
	results: readonly PaletteResult[];
	/** 検索をやり直し、名前の変更・移動・削除を反映した状態を表示する。 */
	onBookmarksChanged?: () => void;
	/** 別のモードからファイルをブックマークしたら、モーダルのパレットを閉じる。 */
	onNoteActionDone?: () => void;
}

function bookmarkEntries(results: readonly PaletteResult[]): BookmarkEntry[] {
	return results.flatMap((result) =>
		result.mode === "bookmark" && result.entry ? [result.entry] : [],
	);
}

/** 通知に移動先の名前を出す。グループの完全なパス、または最上位。 */
function destinationName(chosen: BookmarkGroupItem): string {
	switch (chosen.target.kind) {
		case "top":
			return t("bookmark.topLevel");
		case "group":
			return chosen.description ?? chosen.label;
		case "new":
			return chosen.target.title;
	}
}

/**
 * ブックマークプラグインの操作を、結果のメニューに加える。ブックマークのモードの結果は、
 * 名前を変えたり、別のグループへ移したり、削除したりできる。ほかのモードのファイルは、ブックマークに追加できる。
 * コアのブックマークプラグインが無効なら、何も加えない。
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
					// Why: 現在のタイトルを選択しておき、入力すると置き換わるようにする。
					modal.inputEl.select();
				}),
			);
		}
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.moveToBookmarkGroup).onClick(() =>
				new BookmarkGroupModal(app, instance, {
					placeholder: t("bookmark.placeholder.groups"),
					footerText: t("bookmark.footer.moving", {
						what: countLabel(entries.length, "ブックマーク"),
					}),
					createGroup: (title) => createBookmarkGroup(instance, title),
					onChoose: (parent, chosen) => {
						const moved = moveBookmarks(instance, entries, parent);
						const name = destinationName(chosen);
						new Notice(
							moved > 0
								? t("bookmark.moved", {
										what: countLabel(moved, "ブックマーク"),
										name,
									})
								: t("bookmark.alreadyIn", { name }),
						);
						onBookmarksChanged?.();
					},
				}).open(),
			),
		);
		menu.addItem((item) =>
			withAction(item, MENU_ACTIONS.removeFromBookmarks).onClick(() => {
				const removed = removeBookmarks(instance, entries);
				new Notice(t("bookmark.removed", { what: countLabel(removed, "ブックマーク") }));
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
				placeholder: t("bookmark.placeholder.groups"),
				footerText:
					paths.length === 1
						? t("bookmark.footer.bookmarkingOne", { path: paths[0] })
						: t("bookmark.footer.bookmarking", {
								what: countLabel(paths.length, "ファイル"),
							}),
				createGroup: (title) => createBookmarkGroup(instance, title),
				onChoose: (parent, chosen) => {
					const { added, skipped } = addFileBookmarks(instance, paths, parent);
					const name = destinationName(chosen);
					new Notice(
						added > 0
							? t("bookmark.added", { what: countLabel(added, "ファイル"), name }) +
									(skipped > 0 ? t("bookmark.skipped", { count: skipped }) : "")
							: t("bookmark.alreadyBookmarked", { name }),
					);
					if (added > 0) onNoteActionDone?.();
				},
			}).open(),
		),
	);
}
