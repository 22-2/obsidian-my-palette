import type { App } from "obsidian";

/** One node of the core Bookmarks plugin's tree. The palette keeps a reference to edit it. */
export interface BookmarkEntry {
	type: string;
	title?: string;
	path?: string;
	query?: string;
	items?: BookmarkEntry[];
	ctime?: number;
}

/**
 * The parts of the core Bookmarks plugin instance the palette uses. `addItem` takes the
 * parent group; omitting it adds to the top level.
 */
export interface BookmarksInstance {
	items?: BookmarkEntry[];
	addItem?(item: BookmarkEntry, parent?: BookmarkEntry): void;
	removeItem?(item: BookmarkEntry): void;
	onItemsChanged?(save: boolean): void;
	saveData?(): void | Promise<void>;
}

/** A group a bookmark can be added to or moved into, with the titles leading to it. */
export interface BookmarkGroup {
	group: BookmarkEntry;
	path: readonly string[];
}

/** Separator between group titles, shared with the Bookmarks mode's result titles. */
export const BOOKMARK_PATH_SEPARATOR = " › ";

/** The enabled core Bookmarks plugin, or undefined when it is off. */
export function getBookmarksInstance(app: App): BookmarksInstance | undefined {
	return (
		(
			app as unknown as {
				internalPlugins?: {
					getEnabledPluginById: (id: string) => BookmarksInstance | undefined | null;
				};
			}
		).internalPlugins?.getEnabledPluginById("bookmarks") ?? undefined
	);
}

/** Whether the instance offers every operation the bookmark actions call. */
export function canEditBookmarks(
	instance: BookmarksInstance | undefined,
): instance is Required<Pick<BookmarksInstance, "addItem" | "removeItem">> & BookmarksInstance {
	return typeof instance?.addItem === "function" && typeof instance.removeItem === "function";
}

/** The title Obsidian shows for an entry: its own title, else the file name or query. */
export function bookmarkLabel(entry: BookmarkEntry): string {
	if (entry.title) return entry.title;
	if (entry.type === "file" && entry.path)
		return (entry.path.split("/").pop() ?? entry.path).replace(/\.md$/, "");
	return entry.path || entry.query || "Untitled";
}

/** Every group in tree order, each with the titles from the top level down to it. */
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

/** The list that directly holds `entry`: the top level, a group's items, or undefined. */
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

/** Saves the tree and redraws Obsidian's Bookmarks view after a direct edit. */
function persist(instance: BookmarksInstance): void {
	if (typeof instance.onItemsChanged === "function") instance.onItemsChanged(true);
	else void instance.saveData?.();
}

function targetList(instance: BookmarksInstance, parent: BookmarkEntry | undefined) {
	return parent ? (parent.items ?? []) : (instance.items ?? []);
}

/**
 * Bookmarks each file path in `parent` (the top level when undefined). Paths already
 * bookmarked in that group are skipped, as Obsidian would show them twice.
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

/** Moves entries into `parent` (the top level when undefined), skipping ones already there. */
export function moveBookmarks(
	instance: BookmarksInstance,
	entries: readonly BookmarkEntry[],
	parent: BookmarkEntry | undefined,
): number {
	const destination = targetList(instance, parent);
	let moved = 0;
	for (const entry of new Set(entries)) {
		// Why: a group cannot move into itself, and moving to the current group changes nothing.
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

/** Removes entries from the tree; the files and searches they point to stay untouched. */
export function removeBookmarks(
	instance: BookmarksInstance,
	entries: readonly BookmarkEntry[],
): number {
	const unique = [...new Set(entries)];
	for (const entry of unique) instance.removeItem?.(entry);
	if (unique.length > 0) persist(instance);
	return unique.length;
}

/** Sets the title Obsidian shows for an entry; an empty title falls back to the file name. */
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
 * Adds a top-level group, or returns the existing top-level group with the same title
 * (ignoring case) so typing an existing name never creates a duplicate.
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
