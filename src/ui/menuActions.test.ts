import { describe, expect, it } from "vitest";
import { ACCESS_KEYS, MENU_ACTIONS } from "src/ui/menuActions";

function keysOf(...ids: string[]): string[] {
	return ids.map((id) => {
		const key = ACCESS_KEYS[id];
		if (!key) throw new Error(`no access key: ${id}`);
		return key;
	});
}

describe("アクセスキー", () => {
	it("割り当てた id は実在する操作で、キーは1文字の英大文字", () => {
		const ids = new Set<string>(
			Object.values(MENU_ACTIONS).flatMap((action) => ("id" in action ? [action.id] : [])),
		);
		for (const id of Object.keys(ACCESS_KEYS)) expect(ids.has(id), id).toBe(true);
		for (const key of Object.values(ACCESS_KEYS)) expect(key).toMatch(/^[A-Z]$/);
	});

	it("同じメニューに並ぶ操作どうしでキーが重ならない", () => {
		const fileMenu = keysOf(
			"open",
			"open-in-main-window",
			"open-in-background",
			"open-side-by-side",
			"open-below",
			"open-in-external-editor",
			"show-in-system-explorer",
			"open-in-terminal",
			"copy-file-name",
			"copy-relative-path",
			"copy-absolute-path",
			"move-to-folder",
			"rename",
			"edit-properties",
			"insert-into-moc",
			"add-tags",
			"merge-notes",
			"add-to-bookmarks",
			"rename-bookmark",
			"move-to-bookmark-group",
			"remove-from-bookmarks",
		);
		const tabMenu = keysOf(
			"focus-tab",
			"duplicate-tab",
			"copy-file-name",
			"copy-relative-path",
			"copy-absolute-path",
			"add-tags",
		);
		const propertyMenu = keysOf(
			"edit-property",
			"open-property-in-search",
			"copy-property-value",
			"copy-property-name",
			"delete-property",
		);
		const tagMenu = keysOf("tag-search", "tag-insert-active-note", "tag-rename", "tag-delete");
		for (const menu of [fileMenu, tabMenu, propertyMenu, tagMenu])
			expect(new Set(menu).size).toBe(menu.length);
	});
});
