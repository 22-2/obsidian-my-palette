import { describe, expect, it, vi } from "vitest";
import {
	addFileBookmarks,
	bookmarkLabel,
	createBookmarkGroup,
	findContainingList,
	listBookmarkGroups,
	moveBookmarks,
	removeBookmarks,
	setBookmarkTitle,
	type BookmarkEntry,
	type BookmarksInstance,
} from "src/search/bookmark/bookmarks";
import { bookmarkGroupRows } from "src/search/bookmark/bookmarkGroupRows";

/** A stand-in for the core plugin that edits its tree the way Obsidian does. */
function fakeInstance(items: BookmarkEntry[]) {
	const instance = {
		items,
		addItem: vi.fn((item: BookmarkEntry, parent?: BookmarkEntry) => {
			(parent ? (parent.items ??= []) : instance.items).push(item);
		}),
		removeItem: vi.fn((item: BookmarkEntry) => {
			const list = findContainingList(instance.items, item);
			if (list) list.splice(list.indexOf(item), 1);
		}),
		onItemsChanged: vi.fn(),
	} satisfies BookmarksInstance;
	return instance;
}

function tree() {
	const a: BookmarkEntry = { type: "file", path: "notes/a.md" };
	const b: BookmarkEntry = { type: "file", path: "b.md", title: "Bee" };
	const search: BookmarkEntry = { type: "search", query: "tag:#x" };
	const inner: BookmarkEntry = { type: "group", title: "Inner", items: [b] };
	const work: BookmarkEntry = { type: "group", title: "Work", items: [inner, search] };
	return { a, b, search, inner, work, instance: fakeInstance([a, work]) };
}

describe("しおりラベル", () => {
	it("タイトル、次に .md を除いたファイル名、次にクエリを優先します", () => {
		expect(bookmarkLabel({ type: "file", path: "x/y.md", title: "T" })).toBe("T");
		expect(bookmarkLabel({ type: "file", path: "x/y.md" })).toBe("y");
		expect(bookmarkLabel({ type: "file", path: "x/y.png" })).toBe("y.png");
		expect(bookmarkLabel({ type: "search", query: "q" })).toBe("q");
	});
});

describe("リストブックマークグループ", () => {
	it("ネストされたグループをそのパスとともにツリー順にリストします。", () => {
		const t = tree();
		expect(listBookmarkGroups(t.instance.items)).toEqual([
			{ group: t.work, path: ["Work"] },
			{ group: t.inner, path: ["Work", "Inner"] },
		]);
	});
});

describe("ファイルブックマークの追加", () => {
	it("選択したグループに新しいパスを追加し、既存のパスをスキップします", () => {
		const t = tree();
		const result = addFileBookmarks(t.instance, ["b.md", "c.md", "c.md"], t.inner, 5);
		expect(result).toEqual({ added: 1, skipped: 1 });
		expect(t.inner.items).toEqual([t.b, { type: "file", path: "c.md", ctime: 5 }]);
		expect(t.instance.onItemsChanged).toHaveBeenCalledWith(true);
	});

	it("何も追加されていない場合は保存されません", () => {
		const t = tree();
		expect(addFileBookmarks(t.instance, ["notes/a.md"], undefined)).toEqual({
			added: 0,
			skipped: 1,
		});
		expect(t.instance.onItemsChanged).not.toHaveBeenCalled();
	});
});

describe("ブックマークの移動", () => {
	it("エントリをグループ間および最上位レベルに移動します", () => {
		const t = tree();
		expect(moveBookmarks(t.instance, [t.a, t.search], t.inner)).toBe(2);
		expect(t.inner.items).toEqual([t.b, t.a, t.search]);
		expect(t.work.items).toEqual([t.inner]);
		expect(moveBookmarks(t.instance, [t.b], undefined)).toBe(1);
		expect(t.instance.items).toEqual([t.work, t.b]);
	});

	it("宛先にすでに存在するエントリと、それ自体に移動されたグループをスキップします", () => {
		const t = tree();
		expect(moveBookmarks(t.instance, [t.b], t.inner)).toBe(0);
		expect(moveBookmarks(t.instance, [t.work], t.inner)).toBe(0);
		expect(moveBookmarks(t.instance, [t.work], t.work)).toBe(0);
		expect(t.instance.onItemsChanged).not.toHaveBeenCalled();
	});
});

describe("ブックマークを削除する", () => {
	it("各エントリを一度削除します", () => {
		const t = tree();
		expect(removeBookmarks(t.instance, [t.b, t.b, t.a])).toBe(2);
		expect(t.instance.items).toEqual([t.work]);
		expect(t.inner.items).toEqual([]);
	});
});

describe("ブックマーク名の設定", () => {
	it("トリミングされたタイトルを設定し、空の入力に対してクリアします", () => {
		const t = tree();
		setBookmarkTitle(t.instance, t.a, "  Alpha ");
		expect(t.a.title).toBe("Alpha");
		setBookmarkTitle(t.instance, t.a, " ");
		expect(t.a).not.toHaveProperty("title");
		expect(t.instance.onItemsChanged).toHaveBeenCalledTimes(2);
	});

	it("インスタンスに変更フックがない場合は、saveData を通じて保存します。", () => {
		const entry: BookmarkEntry = { type: "file", path: "a.md" };
		const instance = { items: [entry], saveData: vi.fn() };
		setBookmarkTitle(instance, entry, "A");
		expect(instance.saveData).toHaveBeenCalledOnce();
	});
});

describe("ブックマークグループの作成", () => {
	it("大文字と小文字に関係なく、同じタイトルを持つ最上位グループを再利用します", () => {
		const t = tree();
		expect(createBookmarkGroup(t.instance, "work")).toBe(t.work);
		const created = createBookmarkGroup(t.instance, " Later ", 7);
		expect(created).toEqual({ type: "group", title: "Later", items: [], ctime: 7 });
		expect(t.instance.items.at(-1)).toBe(created);
	});
});

describe("ブックマークグループ行", () => {
	it("最上位から始まり、すべてのグループとそのパスをリストします。", () => {
		const t = tree();
		expect(
			bookmarkGroupRows(t.instance.items, "").map((row) => [row.label, row.description]),
		).toEqual([
			["最上位", "どのグループにも属さない"],
			["Work", "Work"],
			["Inner", "Work › Inner"],
		]);
	});

	it("最上位グループに入力された名前がない場合にのみ、新しいグループを提供します", () => {
		const t = tree();
		const rows = bookmarkGroupRows(t.instance.items, "inn");
		expect(rows.map((row) => row.target.kind)).toEqual(["group", "new"]);
		expect(rows[1].target).toEqual({ kind: "new", title: "inn" });
		expect(
			bookmarkGroupRows(t.instance.items, "WORK").map((row) => row.target.kind),
		).not.toContain("new");
	});
});
