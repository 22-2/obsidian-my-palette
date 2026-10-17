import type { App } from "obsidian";
import { getEnabledCorePlugin } from "src/platform/obsidianInternals";
import { t } from "src/i18n";

/** コアのブックマークプラグインの木の1つのノード。パレットは編集のために参照を保つ。 */
export interface BookmarkEntry {
	type: string;
	title?: string;
	path?: string;
	query?: string;
	items?: BookmarkEntry[];
	ctime?: number;
}

/**
 * パレットが使う、コアのブックマークプラグインのインスタンスの部分。`addItem` は親のグループを受け取る。
 * 省くと最上位に追加する。
 */
export interface BookmarksInstance {
	items?: BookmarkEntry[];
	addItem?(item: BookmarkEntry, parent?: BookmarkEntry): void;
	removeItem?(item: BookmarkEntry): void;
	onItemsChanged?(save: boolean): void;
	saveData?(): void | Promise<void>;
}

/** ブックマークを追加または移動できるグループ。そこへ至るタイトルを付ける。 */
export interface BookmarkGroup {
	group: BookmarkEntry;
	path: readonly string[];
}

/** グループのタイトルの区切り。ブックマークのモードの結果のタイトルと共有する。 */
export const BOOKMARK_PATH_SEPARATOR = " › ";

/** 有効なコアのブックマークプラグイン。オフなら undefined。 */
export function getBookmarksInstance(app: App): BookmarksInstance | undefined {
	return getEnabledCorePlugin<BookmarksInstance>(app, "bookmarks");
}

/** インスタンスが、ブックマークの操作が呼ぶすべての操作を提供しているかどうか。 */
export function canEditBookmarks(
	instance: BookmarksInstance | undefined,
): instance is Required<Pick<BookmarksInstance, "addItem" | "removeItem">> & BookmarksInstance {
	return typeof instance?.addItem === "function" && typeof instance.removeItem === "function";
}

/** Obsidian が項目に出すタイトル: 項目自身のタイトル、なければファイル名または検索語。 */
export function bookmarkLabel(entry: BookmarkEntry): string {
	if (entry.title) return entry.title;
	if (entry.type === "file" && entry.path)
		return (entry.path.split("/").pop() ?? entry.path).replace(/\.md$/, "");
	return entry.path || entry.query || t("bookmark.untitled");
}

/** 木の順に並ぶすべてのグループ。それぞれ、最上位からそこまでのタイトルを付ける。 */
export function listBookmarkGroups(
	items: readonly BookmarkEntry[],
	parentPath: readonly string[] = [],
): BookmarkGroup[] {
	return items.flatMap((item) => {
		if (item.type !== "group") return [];
		const path = [...parentPath, bookmarkLabel(item)];
		return [{ group: item, path }, ...listBookmarkGroups(item.items ?? [], path)];
	});
}

/** `entry` を直接持つ一覧: 最上位、グループの項目、または undefined。 */
export function findContainingList(
	items: BookmarkEntry[],
	entry: BookmarkEntry,
): BookmarkEntry[] | undefined {
	if (items.includes(entry)) return items;
	for (const item of items) {
		if (item.type !== "group") continue;
		const found = findContainingList(item.items ?? [], entry);
		if (found) return found;
	}
	return undefined;
}

/** 木を保存し、直接の編集のあとに Obsidian のブックマークの表示を描き直す。 */
function persist(instance: BookmarksInstance): void {
	if (typeof instance.onItemsChanged === "function") instance.onItemsChanged(true);
	else void instance.saveData?.();
}

function targetList(instance: BookmarksInstance, parent: BookmarkEntry | undefined) {
	return parent ? (parent.items ?? []) : (instance.items ?? []);
}

/**
 * `parent`(undefined なら最上位)に、各ファイルのパスをブックマークする。そのグループに既に
 * ブックマークされたパスは、Obsidian では二重に表示されてしまうので飛ばす。
 */
export function addFileBookmarks(
	instance: BookmarksInstance,
	paths: readonly string[],
	parent: BookmarkEntry | undefined,
	now = Date.now(),
): { added: number; skipped: number } {
	const existing = new Set(
		targetList(instance, parent)
			.filter((item) => item.type === "file" && item.path)
			.map((item) => item.path),
	);
	let added = 0;
	for (const path of new Set(paths)) {
		if (existing.has(path)) continue;
		instance.addItem?.({ type: "file", path, ctime: now }, parent);
		added++;
	}
	if (added > 0) persist(instance);
	return { added, skipped: new Set(paths).size - added };
}

/** 項目を `parent`(undefined なら最上位)へ移す。既にそこにあるものは飛ばす。 */
export function moveBookmarks(
	instance: BookmarksInstance,
	entries: readonly BookmarkEntry[],
	parent: BookmarkEntry | undefined,
): number {
	const destination = targetList(instance, parent);
	let moved = 0;
	for (const entry of new Set(entries)) {
		// Why: グループは自分自身へ移せず、現在のグループへ移しても何も変わらない。
		if (entry === parent || destination.includes(entry)) continue;
		if (parent && entry.type === "group" && findContainingList(entry.items ?? [], parent))
			continue;
		instance.removeItem?.(entry);
		instance.addItem?.(entry, parent);
		moved++;
	}
	if (moved > 0) persist(instance);
	return moved;
}

/** 項目を木から削除する。指しているファイルや検索はそのまま残る。 */
export function removeBookmarks(
	instance: BookmarksInstance,
	entries: readonly BookmarkEntry[],
): number {
	const unique = [...new Set(entries)];
	for (const entry of unique) instance.removeItem?.(entry);
	if (unique.length > 0) persist(instance);
	return unique.length;
}

/** Obsidian が項目に出すタイトルを設定する。空のタイトルはファイル名に戻す。 */
export function setBookmarkTitle(
	instance: BookmarksInstance,
	entry: BookmarkEntry,
	title: string,
): void {
	const trimmed = title.trim();
	if (trimmed) entry.title = trimmed;
	else delete entry.title;
	persist(instance);
}

/**
 * 最上位にグループを追加する。同じタイトル(大文字・小文字は区別しない)の既存の最上位グループがあれば
 * それを返す。既存の名前を入力しても、重複を作らないため。
 */
export function createBookmarkGroup(
	instance: BookmarksInstance,
	title: string,
	now = Date.now(),
): BookmarkEntry {
	const name = title.trim();
	const existing = (instance.items ?? []).find(
		(item) =>
			item.type === "group" &&
			bookmarkLabel(item).toLocaleLowerCase() === name.toLocaleLowerCase(),
	);
	if (existing) return existing;
	const group: BookmarkEntry = { type: "group", title: name, items: [], ctime: now };
	instance.addItem?.(group);
	persist(instance);
	return group;
}
