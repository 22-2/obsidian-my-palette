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

	it("取り消しにくい操作にはキーを付けない", () => {
		for (const id of [
			"move-to-folder",
			"merge-notes",
			"remove-from-bookmarks",
			"delete-property",
			"tag-delete",
			"open-in-external-editor",
		])
			expect(ACCESS_KEYS[id], id).toBeUndefined();
	});

	it("名前変更、プロパティ、タグ、挿入の頭文字が割り当てられている", () => {
		expect(keysOf("rename", "edit-properties", "add-tags", "insert-into-moc")).toEqual([
			"R",
			"P",
			"T",
			"I",
		]);
	});

	it("ノートとファイルの削除は D で、ほかの操作と重ならない", () => {
		expect(keysOf("delete-note", "delete-file")).toEqual(["D", "D"]);
		const withD = Object.entries(ACCESS_KEYS)
			.filter(([, key]) => key === "D")
			.map(([id]) => id);
		expect(withD).toEqual(["delete-note", "delete-file"]);
	});

	it("タブ、プロパティ、タグのメニューでは、キーが重ならない", () => {
		const tabMenu = keysOf("focus-tab", "copy-file-name", "copy-relative-path", "add-tags");
		const propertyMenu = keysOf(
			"edit-property",
			"open-property-in-search",
			"copy-property-value",
			"copy-property-name",
		);
		const tagMenu = keysOf("tag-search", "tag-insert-active-note", "tag-rename");
		for (const menu of [tabMenu, propertyMenu, tagMenu])
			expect(new Set(menu).size).toBe(menu.length);
	});
});
