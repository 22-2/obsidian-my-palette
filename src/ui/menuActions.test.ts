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

	it("書き換える操作と破壊的な操作にはキーを付けない", () => {
		for (const id of [
			"move-to-folder",
			"rename",
			"merge-notes",
			"edit-properties",
			"add-tags",
			"insert-into-moc",
			"remove-from-bookmarks",
			"delete-property",
			"tag-delete",
			"open-in-external-editor",
		])
			expect(ACCESS_KEYS[id], id).toBeUndefined();
	});

	it("同じメニューに並ぶ操作どうしでキーが重ならない", () => {
		const fileMenu = keysOf(
			"open",
			"open-in-background",
			"open-side-by-side",
			"copy-file-name",
			"copy-relative-path",
		);
		const tabMenu = keysOf("focus-tab", "copy-file-name", "copy-relative-path");
		const propertyMenu = keysOf(
			"open-property-in-search",
			"copy-property-value",
			"copy-property-name",
		);
		for (const menu of [fileMenu, tabMenu, propertyMenu])
			expect(new Set(menu).size).toBe(menu.length);
	});
});
