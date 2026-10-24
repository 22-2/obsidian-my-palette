import { describe, expect, it } from "vitest";
import {
	isTagOrChild,
	normalizeTagName,
	renameAliasTags,
	renameFrontmatterTags,
	renameInlineTags,
	renameTagName,
} from "src/tags/tagRename";

describe("正規化タグ名", () => {
	it("先頭のハッシュを削除し、階層を維持します", () => {
		expect(normalizeTagName("#project")).toBe("project");
		expect(normalizeTagName("  ##work/2026 ")).toBe("work/2026");
		expect(normalizeTagName("日本語")).toBe("日本語");
	});

	it("Obsidian がタグとして受け入れない名前を拒否します", () => {
		expect(normalizeTagName("")).toBeUndefined();
		expect(normalizeTagName("#")).toBeUndefined();
		expect(normalizeTagName("a b")).toBeUndefined();
		expect(normalizeTagName("a,b")).toBeUndefined();
		expect(normalizeTagName("2026")).toBeUndefined();
	});
});

describe("タグ名を変更する", () => {
	it("大文字と小文字を区別せずにタグ自体の名前を変更します", () => {
		expect(renameTagName("Project", "project", "work")).toBe("work");
	});

	it("子タグの名前を変更し、残りの部分を保持します", () => {
		expect(renameTagName("project/Alpha/beta", "project", "work")).toBe("work/Alpha/beta");
	});

	it("プレフィックスのみを共有する兄弟タグを残します", () => {
		expect(renameTagName("project-x", "project", "work")).toBe("project-x");
		expect(renameTagName("projects", "project", "work")).toBe("projects");
	});
});

describe("タグと子タグの判定", () => {
	it("大文字と小文字とハッシュを無視して、タグとその子を照合します", () => {
		expect(isTagOrChild("#Project", "project")).toBe(true);
		expect(isTagOrChild("project/a", "project")).toBe(true);
		expect(isTagOrChild("project-a", "project")).toBe(false);
	});
});

describe("FrontmatterTags の名前を変更する", () => {
	it("リスト項目の名前を変更し、他の項目は保持します", () => {
		expect(renameFrontmatterTags(["old", "keep", "old/child"], "old", "new")).toEqual({
			values: ["new", "keep", "new/child"],
			changed: true,
		});
	});

	it("各項目の先頭のハッシュを保持します", () => {
		expect(renameFrontmatterTags(["#old"], "old", "new")).toEqual({
			values: ["#new"],
			changed: true,
		});
	});

	it("カンマまたはスペースで区切られた文字列を読み取り、変更されたときにリストを返します。", () => {
		expect(renameFrontmatterTags("old, keep", "old", "new")).toEqual({
			values: ["new", "keep"],
			changed: true,
		});
	});

	it("名前を変更するものが何もない文字列は書き換えられません", () => {
		expect(renameFrontmatterTags("keep, other", "old", "new")).toEqual({
			values: ["keep", "other"],
			changed: false,
		});
	});

	it("名前変更によって作成された重複を削除し、最初の重複を保持します", () => {
		expect(renameFrontmatterTags(["old", "new", "other"], "old", "new")).toEqual({
			values: ["new", "other"],
			changed: true,
		});
	});

	it("名前変更前に存在していた重複を残します", () => {
		expect(renameFrontmatterTags(["keep", "keep", "old"], "old", "new")).toEqual({
			values: ["keep", "keep", "new"],
			changed: true,
		});
		expect(renameFrontmatterTags(["keep", "keep"], "old", "new").changed).toBe(false);
	});

	it("タグリストではない値を無視します", () => {
		expect(renameFrontmatterTags(42, "old", "new")).toEqual({ values: [], changed: false });
		expect(renameFrontmatterTags(["old", 1], "old", "new").changed).toBe(false);
	});
});

describe("エイリアスタグの名前を変更", () => {
	it("タグであるエイリアスのみの名前を変更します", () => {
		expect(renameAliasTags(["#old/a", "old", "#other"], "old", "new")).toEqual({
			values: ["#new/a", "old", "#other"],
			changed: true,
		});
	});

	it("一致するタグのエイリアスがない場合は、変更が報告されません", () => {
		expect(renameAliasTags(["plain", "#other"], "old", "new")).toEqual({
			values: ["plain", "#other"],
			changed: false,
		});
	});
});

describe("インラインタグの名前を変更する", () => {
	it("いくつかのタグを書き換えて、他のタグのオフセットを有効に保ちます", () => {
		const text = "A #old and #old/x, then #keep and #Old.";
		const at = (tag: string) => {
			const start = text.indexOf(tag);
			return { tag, start, end: start + tag.length };
		};
		const positions = [at("#old"), at("#old/x"), at("#Old")];
		expect(renameInlineTags(text, positions, "old", "new")).toEqual({
			text: "A #new and #new/x, then #keep and #new.",
			count: 3,
		});
	});

	it("ある位置のテキストがタグでなくなったら諦める", () => {
		const positions = [{ tag: "#old", start: 0, end: 4 }];
		expect(renameInlineTags("#changed", positions, "old", "new")).toBeUndefined();
	});
});
